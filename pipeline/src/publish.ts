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
	await writeFile(path.join(outDir, 'artists.json'), JSON.stringify(buildArtists(sorted)));
	return index;
}
