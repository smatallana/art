import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import {
	explainPair,
	microInsight,
	sessionSummary,
	toSessionEndInsights,
	wantsStrength
} from './insight';
import { createModel, modelFromEvents } from './model';
import { patternStatusNow, type OntologyDim } from './profile';
import { testPool, testWork } from './testutil';

const pool = testPool();
const byId = (id: string) => pool.find((w) => w.id === id);

const DIMS: OntologyDim[] = [
	{
		id: 'color.saturation',
		group: 'formal',
		kind: 'scale',
		label: 'Saturation',
		poles: ['muted palettes', 'vivid color']
	},
	{ id: 'mood.serenity', group: 'mood', kind: 'intensity', label: 'Serenity' }
];

let seq = 0;
function choice(a: string, b: string, pick: 'a' | 'b' | 'both' | 'neither' | 'unsure'): AppEvent {
	return {
		id: `s-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 't',
		hour: 12,
		t: 'pair_choice',
		a,
		b,
		pick,
		ms: null
	} as AppEvent;
}

describe('wantsStrength', () => {
	it('asks on informative slots and samples calibration', () => {
		expect(wantsStrength('information', 1)).toBe(true);
		expect(wantsStrength('refutation', 1)).toBe(true);
		expect(wantsStrength('exploration', 1)).toBe(false);
		expect(wantsStrength('challenge', 1)).toBe(false);
		expect(wantsStrength('calibration', 3)).toBe(true);
		expect(wantsStrength('calibration', 4)).toBe(false);
	});
});

describe('explainPair', () => {
	it('names the actually-contrasting dimensions', () => {
		const saturated = pool.find((w) => (w.tags['color.saturation']?.v ?? 0) > 0.7);
		const muted = pool.find((w) => (w.tags['color.saturation']?.v ?? 1) < 0.3);
		if (!saturated || !muted) throw new Error('fixture pool lacks contrast');
		const ex = explainPair(saturated, muted, DIMS);
		expect(ex).not.toBeNull();
		expect(ex?.dimLabels[0]).toBeTruthy();
	});

	it('returns null for a work paired with itself (no honest contrast)', () => {
		const w = testWork('same', {});
		expect(explainPair(w, w, DIMS)).toBeNull();
	});
});

function feedback(
	a: string,
	b: string,
	kind: 'shared' | 'pushed-away' | 'unsure-why',
	aspects: string[]
): AppEvent {
	return {
		id: `f-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 't',
		hour: 12,
		t: 'pair_feedback',
		a,
		b,
		kind,
		aspects
	} as AppEvent;
}

function strength(a: string, b: string, level: 'slight' | 'clear' | 'strong'): AppEvent {
	return {
		id: `st-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 't',
		hour: 12,
		t: 'strength',
		a,
		b,
		level
	} as AppEvent;
}

describe('sessionSummary', () => {
	const saturated = pool.filter((w) => (w.tags['color.saturation']?.v ?? 0) > 0.7);
	const muted = pool.filter((w) => (w.tags['color.saturation']?.v ?? 1) < 0.3);

	it('finds a planted pattern from consistent choices, with dim ids', () => {
		const events: AppEvent[] = [];
		for (let i = 0; i < 4 && i < saturated.length && i < muted.length; i++) {
			events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
		}
		const s = sessionSummary(events, byId, DIMS);
		expect(s.answered).toBe(4);
		expect(s.patterns.length).toBeGreaterThan(0);
		expect(s.patterns[0]?.label.toLowerCase()).toContain('vivid');
		expect(s.patterns[0]?.dimId).toBe('color.saturation');
		expect(s.evidenceWorkIds.length).toBeGreaterThan(0);
		const m = microInsight(events, byId, DIMS);
		expect(m?.toLowerCase()).toContain('vivid');
	});

	it('claims nothing from both/neither-only sessions', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const s = sessionSummary(
			[choice(a.id, b.id, 'both'), choice(a.id, b.id, 'neither')],
			byId,
			DIMS
		);
		expect(s.patterns).toHaveLength(0);
		expect(s.answered).toBe(2);
		expect(microInsight([], byId, DIMS)).toBeNull();
	});

	it('strength weighting amplifies the pull without inflating the count', () => {
		const base = [
			choice(saturated[0]!.id, muted[0]!.id, 'a'),
			choice(saturated[1]!.id, muted[1]!.id, 'a')
		];
		const withStrong = [
			...base,
			strength(saturated[0]!.id, muted[0]!.id, 'strong'),
			strength(saturated[1]!.id, muted[1]!.id, 'strong')
		];
		const plain = sessionSummary(base, byId, DIMS).patterns.find(
			(p) => p.dimId === 'color.saturation'
		);
		const strong = sessionSummary(withStrong, byId, DIMS).patterns.find(
			(p) => p.dimId === 'color.saturation'
		);
		expect(strong).toBeDefined();
		if (plain && strong) expect(strong.n).toBe(plain.n);
	});

	it('content-flagged pairs are excluded from the pull', () => {
		const events: AppEvent[] = [];
		for (let i = 0; i < 4 && i < saturated.length && i < muted.length; i++) {
			events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
			events.push(feedback(saturated[i]!.id, muted[i]!.id, 'unsure-why', ['image-quality']));
		}
		const s = sessionSummary(events, byId, DIMS);
		expect(s.patterns).toHaveLength(0);
		expect(s.answered).toBe(4);
	});

	it('evidence is ranked by contribution, not recency', () => {
		// Three strong-contrast pairs, then one weak-contrast pair LAST: the
		// most recent chosen work must not displace stronger contributors.
		const weakVivid = testWork('weak-vivid', { tags: { 'color.saturation': 0.55 } });
		const weakMuted = testWork('weak-muted', { tags: { 'color.saturation': 0.3 } });
		const poolPlus = [...pool, weakVivid, weakMuted];
		const lookup = (id: string) => poolPlus.find((w) => w.id === id);
		const events: AppEvent[] = [];
		for (let i = 0; i < 3; i++) {
			events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
		}
		events.push(choice(weakVivid.id, weakMuted.id, 'a'));
		const s = sessionSummary(events, lookup, DIMS);
		expect(s.patterns[0]?.dimId).toBe('color.saturation');
		expect(s.evidenceWorkIds).not.toContain(weakVivid.id);
		expect(s.evidenceWorkIds.length).toBe(3);
	});

	it('surfaces a counterexample when one choice went against the pattern', () => {
		const events: AppEvent[] = [];
		for (let i = 0; i < 4 && i < saturated.length && i < muted.length; i++) {
			events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
		}
		// One opposite choice: picked the muted work.
		events.push(choice(saturated[4]!.id, muted[4]!.id, 'b'));
		const s = sessionSummary(events, byId, DIMS);
		expect(s.patterns[0]?.dimId).toBe('color.saturation');
		expect(s.counterExampleWorkId).toBe(muted[4]!.id);
	});

	it('repeated rejection over the same taste aspect becomes evidence; content flags never do', () => {
		const pairs = [
			[pool[0]!, pool[1]!],
			[pool[2]!, pool[3]!],
			[pool[4]!, pool[5]!]
		] as const;
		const events: AppEvent[] = [];
		for (const [a, b] of pairs) {
			events.push(choice(a.id, b.id, 'neither'));
			events.push(feedback(a.id, b.id, 'pushed-away', ['too-busy']));
		}
		const s = sessionSummary(events, byId, DIMS);
		expect(s.rejection).toEqual({ aspect: 'too-busy', n: 3 });
		const flagged = pairs.flatMap(([a, b]) => [
			choice(a.id, b.id, 'neither'),
			feedback(a.id, b.id, 'pushed-away', ['image-quality'])
		]);
		expect(sessionSummary(flagged, byId, DIMS).rejection).toBeNull();
	});

	it('repeated both answers sharing an aspect become shared evidence', () => {
		const events: AppEvent[] = [
			choice(pool[0]!.id, pool[1]!.id, 'both'),
			feedback(pool[0]!.id, pool[1]!.id, 'shared', ['atmosphere']),
			choice(pool[2]!.id, pool[3]!.id, 'both'),
			feedback(pool[2]!.id, pool[3]!.id, 'shared', ['atmosphere'])
		];
		const s = sessionSummary(events, byId, DIMS);
		expect(s.shared).toEqual({ aspect: 'atmosphere', n: 2 });
	});
});

describe('sessionSummary on a sparse catalog (tramo 8 — era + facts)', () => {
	// The real catalog's median tag count is ZERO: works whose only feature is
	// their era one-hot. The summary must still find something true to say.
	const modern = [1905, 1920, 1935].map((y, i) => testWork(`mod${i}`, { year: y, tags: {} }));
	const old = [1510, 1600, 1650].map((y, i) => testWork(`old${i}`, { year: y, tags: {} }));
	const lookup = (id: string) => [...modern, ...old].find((w) => w.id === id);

	it('era is a first-class pattern when nothing else is tagged', () => {
		const events = modern.map((m, i) => choice(m.id, old[i]!.id, 'a'));
		const s = sessionSummary(events, lookup, DIMS);
		expect(s.patterns[0]?.dimId).toBe('era.e1900');
		expect(s.patterns[0]?.label).toBe('the modern era');
		expect(s.patterns[0]?.n).toBe(3);
		expect(s.evidenceWorkIds.length).toBeGreaterThan(0);
	});

	it('an era pattern does not drag its mechanical mirror in as a counter', () => {
		const events = modern.map((m, i) => choice(m.id, old[i]!.id, 'a'));
		const s = sessionSummary(events, lookup, DIMS);
		// Choosing modern over the 1500s–1600s pushes the latter negative by
		// construction; that mirror is not a contradiction worth reporting.
		expect(s.counter).toBeNull();
	});

	it('consistent era rejection without an era preference still surfaces', () => {
		// Three different-era works each chosen OVER a 1500s–1600s work: no
		// single era wins, but one era consistently loses — that is real.
		const varied = [1450, 1780, 1870].map((y, i) => testWork(`var${i}`, { year: y, tags: {} }));
		const vlookup = (id: string) => [...varied, ...old].find((w) => w.id === id);
		const events = varied.map((v, i) => choice(v.id, old[i]!.id, 'a'));
		const s = sessionSummary(events, vlookup, DIMS);
		expect(s.patterns).toHaveLength(0);
		expect(s.counter?.dimId).toBe('era.e1500');
	});

	it('no-pattern endings carry distinct computed facts, never one fixed line', () => {
		const w = (id: string, year: number) => testWork(id, { year, tags: {} });
		const poolAll = [
			w('a', 1450),
			w('b', 1600),
			w('c', 1780),
			w('d', 1870),
			w('e', 1930),
			w('f', 1460),
			w('g', 1610)
		];
		const flookup = (id: string) => poolAll.find((x) => x.id === id);
		const save = (work: string): AppEvent =>
			({
				id: `sv-${work}`,
				at: new Date(1700000005000).toISOString(),
				device: 't',
				hour: 12,
				t: 'save',
				work
			}) as AppEvent;
		// Five differently-shaped sessions, none with a pattern. Distinct in
		// (answered, eras seen, saves) — the tuple the ending is built from.
		const sessions: AppEvent[][] = [
			[choice('a', 'b', 'both')],
			[choice('a', 'b', 'neither'), choice('c', 'd', 'neither')],
			[choice('e', 'a', 'a'), choice('c', 'd', 'neither'), choice('f', 'g', 'unsure')],
			[choice('a', 'b', 'both'), save('a')],
			[choice('a', 'b', 'unsure'), choice('f', 'g', 'unsure'), choice('a', 'g', 'unsure')]
		];
		const endings = sessions.map((events) => {
			const s = sessionSummary(events, flookup, DIMS);
			expect(s.patterns).toHaveLength(0);
			return JSON.stringify({ answered: s.answered, facts: s.facts });
		});
		expect(new Set(endings).size).toBe(sessions.length);
	});

	it('picks concentrated in one era become a stated fact even without era contrast', () => {
		// Both works of each pair share the era: no era pull exists, but the
		// concentration of picks is still a true, sayable fact.
		const events = [choice('mod0', 'mod1', 'a'), choice('mod1', 'mod2', 'a')];
		const s = sessionSummary(events, lookup, DIMS);
		expect(s.patterns).toHaveLength(0);
		expect(s.facts.topEra).toEqual({ label: 'the modern era', n: 2 });
		expect(s.facts.erasSeen).toBe(1);
	});
});

describe('session insight persistence (tramo 9)', () => {
	const saturated = pool.filter((w) => (w.tags['color.saturation']?.v ?? 0) > 0.7);
	const muted = pool.filter((w) => (w.tags['color.saturation']?.v ?? 1) < 0.3);
	const events: AppEvent[] = [];
	for (let i = 0; i < 4 && i < saturated.length && i < muted.length; i++) {
		events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
	}

	it('toSessionEndInsights freezes patterns with the model z of the moment', () => {
		const model = modelFromEvents(events, { workById: byId });
		const s = sessionSummary(events, byId, DIMS);
		const frozen = toSessionEndInsights(s, model);
		expect(frozen.v).toBe(1);
		expect(frozen.patterns[0]?.dim).toBe('color.saturation');
		expect(frozen.patterns[0]?.s).toBe(1);
		expect(frozen.patterns[0]?.z).toBeGreaterThan(0);
		expect(frozen.answered).toBe(4);
		// Compact: well under the sync layer's 16 KiB event cap.
		expect(JSON.stringify(frozen).length).toBeLessThan(1024);
		// Without a model the snapshot still forms, with z 0.
		expect(toSessionEndInsights(s, null).patterns[0]?.z).toBe(0);
	});

	it('session_end with insights is fold-neutral: conclusions are never evidence', () => {
		const s = sessionSummary(events, byId, DIMS);
		const withEnd: AppEvent[] = [
			...events,
			{
				id: 'end-1',
				at: new Date(1700000009000).toISOString(),
				device: 't',
				hour: 12,
				t: 'session_end',
				shown: 4,
				answered: 4,
				insights: toSessionEndInsights(s, null)
			} as AppEvent
		];
		const bare = modelFromEvents(events, { workById: byId });
		const withInsights = modelFromEvents(withEnd, { workById: byId });
		expect(withInsights.observations).toBe(bare.observations);
		expect([...withInsights.dims.entries()]).toEqual([...bare.dims.entries()]);
	});

	it('patternStatusNow reports all five outcomes honestly', () => {
		const model = createModel();
		const dim = (mu: number, variance: number, n = 10) => ({
			mu,
			variance,
			n,
			signAgreement: 1,
			provisional: false
		});
		model.dims.set('up', dim(0.8, 0.1)); // z ≈ 2.53
		model.dims.set('down', dim(-0.5, 0.1)); // sign flipped vs s: 1
		model.dims.set('same', dim(0.45, 0.1)); // z ≈ 1.42
		model.dims.set('faded', dim(0.1, 0.4, 2)); // n below evidence floor
		expect(patternStatusNow({ dim: 'up', s: 1, z: 1.5 }, model)).toBe('strengthened');
		expect(patternStatusNow({ dim: 'up', s: 1, z: 2.9 }, model)).toBe('weakened');
		expect(patternStatusNow({ dim: 'down', s: 1, z: 1.0 }, model)).toBe('changed');
		expect(patternStatusNow({ dim: 'same', s: 1, z: 1.45 }, model)).toBe('holds');
		expect(patternStatusNow({ dim: 'faded', s: 1, z: 1.0 }, model)).toBe('unresolved');
		expect(patternStatusNow({ dim: 'never-seen', s: 1, z: 1.0 }, model)).toBe('unresolved');
	});
});
