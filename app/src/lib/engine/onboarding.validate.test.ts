/**
 * Editorial-collection validation: the committed onboarding.json must stay
 * consistent with the committed catalog. A catalog rebuild that drops ids,
 * or an edit that breaks the spread, fails HERE by design — the rebuild
 * tramo must then update the collection.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Work } from '../catalog/types';
import { WELCOME_HERO_ID } from '../welcome';
import { onboardingEligible } from './curation';
import { OPENING_SLOTS, sideCandidates } from './opening';
import { aspectCompatible } from './selector';
import { eraBucket } from './strata';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const curated = JSON.parse(
	readFileSync(path.join(root, 'data', 'curated', 'onboarding.json'), 'utf8')
) as {
	version: number;
	works: {
		id: string;
		stage: 1 | 2 | 3;
		role: 'anchor' | 'discovery' | 'contrast';
		note?: string;
	}[];
};

const catalogDir = path.join(root, 'app', 'static', 'catalog');
const index = JSON.parse(readFileSync(path.join(catalogDir, 'index.json'), 'utf8')) as {
	shards: { file: string }[];
};
const byId = new Map<string, Work>();
for (const s of index.shards) {
	for (const w of JSON.parse(readFileSync(path.join(catalogDir, s.file), 'utf8')) as Work[]) {
		byId.set(w.id, w);
	}
}

describe('onboarding.json vs committed catalog', () => {
	it('every curated id exists in the catalog', () => {
		const missing = curated.works.filter((e) => !byId.has(e.id)).map((e) => e.id);
		expect(missing).toEqual([]);
	});

	it('every curated work passes onboarding eligibility', () => {
		const failing = curated.works
			.map((e) => byId.get(e.id))
			.filter((w): w is Work => !!w && !onboardingEligible(w))
			.map((w) => w.id);
		expect(failing).toEqual([]);
	});

	it('the collection has editorial size and spread', () => {
		expect(curated.works.length).toBeGreaterThanOrEqual(250);
		expect(curated.works.length).toBeLessThanOrEqual(350);
		for (const stage of [1, 2, 3] as const) {
			const inStage = curated.works.filter((e) => e.stage === stage);
			expect(inStage.length).toBeGreaterThanOrEqual(40);
			// Era spread within each stage: at least 3 distinct buckets.
			const eras = new Set(inStage.map((e) => eraBucket(byId.get(e.id) as Work)));
			expect(eras.size).toBeGreaterThanOrEqual(3);
		}
		const artists = new Set(
			curated.works.map((e) => (byId.get(e.id) as Work | undefined)?.artist.name)
		);
		expect(artists.size).toBeGreaterThanOrEqual(40);
	});

	it('no source dominates and fragile manual ids stay rare', () => {
		const bySource = new Map<string, number>();
		for (const e of curated.works) {
			const src = (byId.get(e.id) as Work | undefined)?.source ?? 'missing';
			bySource.set(src, (bySource.get(src) ?? 0) + 1);
		}
		for (const [src, n] of bySource) {
			expect(n / curated.works.length, `source ${src}`).toBeLessThanOrEqual(0.4);
		}
		// wd-m-* ids derive from artist+title text and break on renames.
		const fragile = curated.works.filter((e) => e.id.startsWith('wd-m-')).length;
		expect(fragile).toBeLessThanOrEqual(10);
	});

	it('anchors exist in every stage (the recovery pivot draws on them)', () => {
		for (const stage of [1, 2, 3] as const) {
			const anchors = curated.works.filter((e) => e.stage === stage && e.role === 'anchor');
			expect(anchors.length, `stage ${stage}`).toBeGreaterThanOrEqual(10);
		}
	});

	it('every opening slot is fillable against the committed catalog', () => {
		// The scripted opening (tramo 9) must have real room: enough candidates
		// per side and enough valid pairings that cooldowns and aspect rules
		// cannot starve a slot. If a slot goes thin after a catalog rebuild,
		// the fix is editing data/curated/onboarding.json — not loosening this.
		const works = [...byId.values()];
		for (const slot of OPENING_SLOTS) {
			const a = sideCandidates(works, curated, slot.a);
			const b = sideCandidates(works, curated, slot.b);
			console.log(`[opening] ${slot.name}: sideA=${a.length} sideB=${b.length}`);
			expect(a.length, `${slot.name} side a`).toBeGreaterThanOrEqual(8);
			expect(b.length, `${slot.name} side b`).toBeGreaterThanOrEqual(8);
			let pairs = 0;
			outer: for (const wa of a) {
				for (const wb of b) {
					if (wa.id === wb.id || wa.artist.name === wb.artist.name) continue;
					if (!aspectCompatible(wa, wb)) continue;
					pairs++;
					if (pairs >= 12) break outer;
				}
			}
			expect(pairs, `${slot.name} valid pairs`).toBeGreaterThanOrEqual(12);
		}
	});

	it('every editorial opening pair is real and fits its slot', () => {
		// data/curated/opening.json is hand-editable: every committed variant
		// must reference catalog works that satisfy the slot's OWN side filters
		// (a fits side a, b fits side b — the file's order is meaningful), with
		// distinct artists and compatible aspects. Thin slots get edited, not
		// exempted. This is also the drift guard for the pipeline's mirror of
		// the slot filters (openingcurate.ts).
		const opening = JSON.parse(
			readFileSync(path.join(root, 'data', 'curated', 'opening.json'), 'utf8')
		) as { version: number; slots: { name: string; pairs: { a: string; b: string }[] }[] };
		const works = [...byId.values()];
		for (const slot of OPENING_SLOTS) {
			const entry = opening.slots.find((s) => s.name === slot.name);
			expect(entry, `slot ${slot.name} present`).toBeTruthy();
			if (!entry) continue;
			expect(entry.pairs.length, `${slot.name} variants`).toBeGreaterThanOrEqual(4);
			const sideA = new Set(sideCandidates(works, curated, slot.a).map((w) => w.id));
			const sideB = new Set(sideCandidates(works, curated, slot.b).map((w) => w.id));
			for (const p of entry.pairs) {
				const wa = byId.get(p.a);
				const wb = byId.get(p.b);
				expect(wa, `${slot.name}: ${p.a} in catalog`).toBeTruthy();
				expect(wb, `${slot.name}: ${p.b} in catalog`).toBeTruthy();
				if (!wa || !wb) continue;
				expect(sideA.has(p.a), `${slot.name}: ${p.a} fits side a`).toBe(true);
				expect(sideB.has(p.b), `${slot.name}: ${p.b} fits side b`).toBe(true);
				expect(wa.artist.name, `${slot.name}: ${p.a}×${p.b} artists`).not.toBe(wb.artist.name);
				expect(aspectCompatible(wa, wb), `${slot.name}: ${p.a}×${p.b} aspects`).toBe(true);
			}
		}
		const known = new Set(OPENING_SLOTS.map((s) => s.name));
		const orphans = opening.slots.filter((s) => !known.has(s.name)).map((s) => s.name);
		expect(orphans, 'slots without an engine counterpart').toEqual([]);
	});

	it('honors the human audit when it exists (no gate until then — owner decision)', () => {
		// The audit-kit HTML (pipeline `audit-kit`) is a tool, not a gate: until
		// the owner completes his review and commits data/curated/audit.json,
		// nothing blocks. Once it exists, a work he REJECTED must not remain in
		// the onboarding collection.
		const auditFile = path.join(root, 'data', 'curated', 'audit.json');
		if (!existsSync(auditFile)) return;
		const audit = JSON.parse(readFileSync(auditFile, 'utf8')) as {
			works: Record<string, { ok: boolean; notes?: string }>;
		};
		const reviewed = curated.works.filter((e) => audit.works[e.id] != null).length;
		console.log(`[audit] ${reviewed}/${curated.works.length} curated works human-reviewed`);
		const rejected = curated.works.filter((e) => audit.works[e.id]?.ok === false).map((e) => e.id);
		expect(rejected, 'rejected works still in onboarding.json').toEqual([]);
	});

	it('the welcome hero is a precached bootstrap work and a stage-1 anchor', () => {
		// The welcome renders before any shard arrives — the hero must live in
		// bootstrap.json or a fresh device gets a blank backdrop.
		const bootstrap = JSON.parse(
			readFileSync(path.join(catalogDir, 'bootstrap.json'), 'utf8')
		) as Work[];
		expect(bootstrap.some((w) => w.id === WELCOME_HERO_ID)).toBe(true);
		const entry = curated.works.find((e) => e.id === WELCOME_HERO_ID);
		expect(entry?.stage).toBe(1);
		expect(entry?.role).toBe('anchor');
	});
});
