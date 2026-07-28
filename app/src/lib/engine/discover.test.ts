import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import {
	applyFilter,
	contributions,
	exploreFilters,
	likedWorkIds,
	recommendChallenge,
	recommendClose,
	searchWorks,
	seenWorkIds,
	suggestArtists,
	surpriseMe
} from './discover';
import { modelFromEvents } from './model';
import type { OntologyDim } from './profile';
import { testPool } from './testutil';

const ONTOLOGY: OntologyDim[] = [
	{ id: 'subject.portrait', group: 'subject', kind: 'binary', label: 'Portraits' },
	{ id: 'subject.landscape', group: 'subject', kind: 'binary', label: 'Landscapes' },
	{ id: 'subject.stilllife', group: 'subject', kind: 'binary', label: 'Still lifes' },
	{
		id: 'color.saturation',
		group: 'color',
		kind: 'scale',
		label: 'Saturation',
		poles: ['muted', 'vivid']
	}
];
const ontologyMap = new Map(ONTOLOGY.map((d) => [d.id, d]));

function pairEvent(i: number, a: string, b: string, pick: 'a' | 'b'): AppEvent {
	return {
		id: `e${i}`,
		at: new Date(1700000000000 + i * 60000).toISOString(),
		device: 'd',
		hour: 12,
		t: 'pair_choice',
		a,
		b,
		pick,
		ms: null
	};
}

/** Simulated landscape-lover history: landscapes beat still lifes. */
function landscapeLoverEvents(pool: ReturnType<typeof testPool>): AppEvent[] {
	const landscapes = pool.filter((w) => (w.tags['subject.landscape']?.v ?? 0) > 0.5);
	const stills = pool.filter((w) => (w.tags['subject.stilllife']?.v ?? 0) > 0.5);
	const events: AppEvent[] = [];
	for (let i = 0; i < 20; i++) {
		const l = landscapes[i % landscapes.length];
		const s = stills[i % stills.length];
		if (l && s) events.push(pairEvent(i, l.id, s.id, 'a'));
	}
	return events;
}

function ctxFor(
	pool: ReturnType<typeof testPool>
): (id: string) => (typeof pool)[number] | undefined {
	const map = new Map(pool.map((w) => [w.id, w]));
	return (id) => map.get(id);
}

describe('discovery', () => {
	it('close recommendations skip seen works and lean toward learned taste', () => {
		const pool = testPool(120);
		const events = landscapeLoverEvents(pool);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const recs = recommendClose(model, pool, events, ontologyMap, ctxFor(pool), 10);
		expect(recs.length).toBeGreaterThan(0);
		const seen = seenWorkIds(events);
		for (const r of recs) expect(seen.has(r.work.id)).toBe(false);
		const landscapeShare =
			recs.filter((r) => (r.work.tags['subject.landscape']?.v ?? 0) > 0.5).length / recs.length;
		expect(landscapeShare).toBeGreaterThan(0.4);
		// every close rec explains itself with positive contributions
		for (const r of recs) {
			expect(r.why.length).toBeGreaterThan(0);
			for (const c of r.why) expect(c.value).toBeGreaterThan(0);
		}
	});

	it('close recs cite related liked works when dims overlap', () => {
		const pool = testPool(120);
		const events = landscapeLoverEvents(pool);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const recs = recommendClose(model, pool, events, ontologyMap, ctxFor(pool), 10);
		const withRelated = recs.filter((r) => r.related.length > 0);
		expect(withRelated.length).toBeGreaterThan(0);
		const liked = likedWorkIds(events);
		for (const r of withRelated) {
			for (const rel of r.related) expect(liked.has(rel.id)).toBe(true);
		}
	});

	it('challenge recommendations differ from close ones', () => {
		const pool = testPool(120);
		const events = landscapeLoverEvents(pool);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const close = new Set(
			recommendClose(model, pool, events, ontologyMap, ctxFor(pool), 10).map((r) => r.work.id)
		);
		const challenge = recommendChallenge(model, pool, events, ontologyMap, 8);
		expect(challenge.length).toBeGreaterThan(0);
		const overlap = challenge.filter((r) => close.has(r.work.id)).length;
		expect(overlap).toBeLessThanOrEqual(2);
	});

	it('surprise returns an unseen work, deterministically per seed', () => {
		const pool = testPool(120);
		const events = landscapeLoverEvents(pool);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const s1 = surpriseMe(model, pool, events, 42);
		const s2 = surpriseMe(model, pool, events, 42);
		expect(s1).not.toBeNull();
		expect(s1!.id).toBe(s2!.id);
		expect(seenWorkIds(events).has(s1!.id)).toBe(false);
	});

	it('suggests unencountered artists with multiple works', () => {
		const pool = testPool(120);
		// short history → most of the 20 fixture artists remain unencountered
		const events = landscapeLoverEvents(pool).slice(0, 6);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const artists = suggestArtists(model, pool, events, 5);
		expect(artists.length).toBeGreaterThan(0);
		for (const a of artists) {
			expect(a.sampleWorks.length).toBeGreaterThanOrEqual(2);
		}
	});

	it('explore filters count and apply consistently', () => {
		const pool = testPool(120);
		const filters = exploreFilters(pool);
		const era = filters.find((f) => f.kind === 'era');
		expect(era).toBeDefined();
		expect(applyFilter(pool, era!)).toHaveLength(era!.count);
		const subject = filters.find((f) => f.kind === 'subject');
		expect(subject).toBeDefined();
		expect(applyFilter(pool, subject!)).toHaveLength(subject!.count);
	});

	it('search matches artist and title, ranked', () => {
		const pool = testPool(60);
		const hits = searchWorks(pool, 'Artist 3');
		expect(hits.length).toBeGreaterThan(0);
		for (const w of hits) expect(w.artist.name).toContain('Artist 3');
		expect(searchWorks(pool, 'x')).toHaveLength(0); // sub-2-char guard
	});

	it('contributions are signed and sorted by magnitude', () => {
		const pool = testPool(120);
		const events = landscapeLoverEvents(pool);
		const model = modelFromEvents(events, { workById: ctxFor(pool) });
		const landscape = pool.find((w) => (w.tags['subject.landscape']?.v ?? 0) > 0.5)!;
		const cs = contributions(model, landscape, ontologyMap);
		expect(cs.length).toBeGreaterThan(0);
		for (let i = 1; i < cs.length; i++) {
			expect(Math.abs(cs[i - 1]!.value)).toBeGreaterThanOrEqual(Math.abs(cs[i]!.value));
		}
	});
});
