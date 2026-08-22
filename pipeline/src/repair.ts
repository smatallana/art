/**
 * repair: apply integrity fixes to the COMMITTED catalog in place, without a
 * network rebuild (precedent: the thumb-URL and micro-story repairs). Pure,
 * deterministic, and identical to what the next full build would produce now
 * that the same rules live in the source adapters (T11-E1):
 *
 *   1. drop works marked `"drop": true` in data/curated/overrides.json —
 *      wrong-image records confirmed by human eyes;
 *   2. genid artist names (raw blank-node URLs) → 'Unknown artist';
 *   3. rights for wd-Q* works recomputed by the conservative wdRights rule
 *      (manual wd-m-* landmarks keep their explicit rights);
 *   4. quality.flags deduplicated (the --merge duplication bug);
 *   5. clip-sourced light.nocturne tags stripped — the dim is measurably
 *      miscalibrated (38% of the catalog tagged nocturnal, daylight harbors
 *      included) and CLIP confidences are capped below every usable floor,
 *      so removal is the only honest lever (owner decision, tramo 11).
 *
 * Republishes shards/index/bootstrap (fresh generatedAt = client cache key)
 * and refreshes data/coverage.json. Fails loudly if a dropped id is still
 * referenced by the curated onboarding, the editorial opening, or the
 * welcome hero.
 */
import { readFile } from 'node:fs/promises';
import { loadCatalog } from './catalog.js';
import { publishCatalog } from './publish.js';
import { wdRights } from './rights.js';
import type { Work } from './types.js';

const GENID = /^https?:\/\//;
const WELCOME_HERO_ID = 'aic-100191'; // mirrors app/src/lib/welcome.ts

export interface RepairStats {
	dropped: string[];
	genidFixed: number;
	rightsRelabeled: number;
	flagsDeduped: number;
	nocturneStripped: number;
	total: number;
}

export async function runRepair(opts: {
	catalogDir: string;
	overridesFile: string;
	onboardingFile: string;
	openingFile: string;
	ontologyFile: string;
	log: (m: string) => void;
}): Promise<RepairStats> {
	const { catalogDir, overridesFile, onboardingFile, openingFile, ontologyFile, log } = opts;
	const works = await loadCatalog(catalogDir);
	const overrides = JSON.parse(await readFile(overridesFile, 'utf8')) as Record<
		string,
		{ drop?: boolean; note?: string }
	>;
	const dropIds = new Set(
		Object.entries(overrides)
			.filter(([, o]) => o.drop === true)
			.map(([id]) => id)
	);

	// Safety gate: never drop a work the editorial layers still reference.
	const onboarding = JSON.parse(await readFile(onboardingFile, 'utf8')) as {
		works: { id: string }[];
	};
	const opening = JSON.parse(await readFile(openingFile, 'utf8')) as {
		slots: { pairs: { a: string; b: string }[] }[];
	};
	const referenced = new Set<string>([WELCOME_HERO_ID]);
	for (const e of onboarding.works) referenced.add(e.id);
	for (const s of opening.slots)
		for (const p of s.pairs) (referenced.add(p.a), referenced.add(p.b));
	const conflicts = [...dropIds].filter((id) => referenced.has(id));
	if (conflicts.length > 0) {
		throw new Error(
			`refusing to drop curated-referenced works: ${conflicts.join(', ')} — prune the curated files first`
		);
	}

	const stats: RepairStats = {
		dropped: [],
		genidFixed: 0,
		rightsRelabeled: 0,
		flagsDeduped: 0,
		nocturneStripped: 0,
		total: 0
	};

	const repaired: Work[] = [];
	for (const w of works) {
		if (dropIds.has(w.id)) {
			stats.dropped.push(w.id);
			continue;
		}
		let out = w;
		if (GENID.test(out.artist.name)) {
			out = { ...out, artist: { ...out.artist, name: 'Unknown artist' } };
			stats.genidFixed++;
		}
		if (out.source === 'wd' && /^wd-Q/.test(out.id)) {
			const rights = wdRights(out.artist, out.date.start ?? out.date.end);
			if (rights.status !== out.rights.status) {
				out = { ...out, rights };
				stats.rightsRelabeled++;
			}
		}
		const deduped = [...new Set(out.quality.flags)];
		if (deduped.length !== out.quality.flags.length) {
			out = { ...out, quality: { ...out.quality, flags: deduped } };
			stats.flagsDeduped++;
		}
		if (out.tags['light.nocturne']?.src === 'clip') {
			const tags = { ...out.tags };
			delete tags['light.nocturne'];
			out = { ...out, tags };
			stats.nocturneStripped++;
		}
		repaired.push(out);
	}
	stats.total = repaired.length;

	const ontology = JSON.parse(await readFile(ontologyFile, 'utf8')) as { version: number };
	await publishCatalog(repaired, catalogDir, ontology.version);
	log(
		`repair: dropped ${stats.dropped.length} (${stats.dropped.join(', ')}), ` +
			`genid ${stats.genidFixed}, rights ${stats.rightsRelabeled}, ` +
			`flags ${stats.flagsDeduped}, nocturne ${stats.nocturneStripped}; ` +
			`republished ${stats.total} works`
	);
	return stats;
}
