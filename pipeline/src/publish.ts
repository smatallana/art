/**
 * Emit the catalog the app consumes: sharded works + index + artists rollup.
 * Shards are content-stable (sorted by id) so unchanged shards keep their
 * bytes across runs → service-worker caches stay warm.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogIndex, Work } from './types.js';
import { WorkSchema } from './types.js';

const SHARD_SIZE = 250;
const SCHEMA_VERSION = 1;

export interface ArtistEntry {
	slug: string;
	name: string;
	born: number | null;
	died: number | null;
	nationality: string | null;
	workCount: number;
	sampleWorkIds: string[];
}

export function artistSlug(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function buildArtists(works: Work[]): ArtistEntry[] {
	const map = new Map<string, ArtistEntry>();
	for (const w of works) {
		if (w.artist.name === 'Unknown artist') continue;
		const slug = artistSlug(w.artist.name);
		const existing = map.get(slug);
		if (existing) {
			existing.workCount++;
			if (existing.sampleWorkIds.length < 4) existing.sampleWorkIds.push(w.id);
			existing.born ??= w.artist.born;
			existing.died ??= w.artist.died;
			existing.nationality ??= w.artist.nationality;
		} else {
			map.set(slug, {
				slug,
				name: w.artist.name,
				born: w.artist.born,
				died: w.artist.died,
				nationality: w.artist.nationality,
				workCount: 1,
				sampleWorkIds: [w.id]
			});
		}
	}
	return [...map.values()].sort((a, b) => b.workCount - a.workCount);
}

/**
 * Bootstrap selection: a small, high-quality, era-stratified subset the app
 * embeds in its precache so a first session can start before (or without)
 * the full catalog. Deterministic given the works list.
 */
export function selectBootstrap(works: Work[], target = 80): Work[] {
	const century = (w: Work): number => Math.floor(((w.date.start ?? 1600) - 1) / 100) + 1;
	const buckets = new Map<number, Work[]>();
	for (const w of works) {
		const c = century(w);
		if (!buckets.has(c)) buckets.set(c, []);
		(buckets.get(c) as Work[]).push(w);
	}
	for (const list of buckets.values()) {
		list.sort((a, b) => b.quality.score - a.quality.score || a.id.localeCompare(b.id));
	}
	// Proportional allocation so marginal eras don't crowd out the core:
	// buckets under 15 works get no reserved slots (their best works still
	// compete in the final fill), others get ceil(share) capped at bucket size.
	const total = works.length;
	const picked: Work[] = [];
	const taken = new Set<string>();
	for (const [, list] of buckets) {
		if (list.length < 15) continue;
		const quota = Math.min(list.length, Math.max(2, Math.round((target * list.length) / total)));
		for (const w of list.slice(0, quota)) {
			picked.push(w);
			taken.add(w.id);
		}
	}
	// Fill any remainder with the globally best not yet taken.
	const byQuality = [...works].sort(
		(a, b) => b.quality.score - a.quality.score || a.id.localeCompare(b.id)
	);
	for (const w of byQuality) {
		if (picked.length >= Math.min(target, works.length)) break;
		if (!taken.has(w.id)) {
			picked.push(w);
			taken.add(w.id);
		}
	}
	return picked.slice(0, target).sort((a, b) => a.id.localeCompare(b.id));
}

export async function publishCatalog(
	works: Work[],
	outDir: string,
	ontologyVersion: number
): Promise<CatalogIndex> {
	// Validate every record against the schema before anything is written.
	for (const w of works) WorkSchema.parse(w);

	const sorted = [...works].sort((a, b) => a.id.localeCompare(b.id));
	await mkdir(outDir, { recursive: true });

	const shards: CatalogIndex['shards'] = [];
	for (let i = 0; i < sorted.length; i += SHARD_SIZE) {
		const chunk = sorted.slice(i, i + SHARD_SIZE);
		const file = `works-${String(shards.length).padStart(3, '0')}.json`;
		await writeFile(path.join(outDir, file), JSON.stringify(chunk));
		shards.push({ file, count: chunk.length });
	}

	const sources: CatalogIndex['sources'] = {};
	for (const w of sorted) {
		if (!sources[w.source]) {
			sources[w.source] = { count: 0, attribution: w.rights.attribution };
		}
		(sources[w.source] as { count: number }).count++;
	}

	const index: CatalogIndex = {
		schemaVersion: SCHEMA_VERSION,
		ontologyVersion,
		generatedAt: new Date().toISOString(),
		count: sorted.length,
		shards,
		sources
	};
	await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1));
	await writeFile(path.join(outDir, 'bootstrap.json'), JSON.stringify(selectBootstrap(sorted)));
	return index;
}
