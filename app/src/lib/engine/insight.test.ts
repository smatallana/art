import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { explainPair, microInsight, sessionSummary, wantsStrength } from './insight';
import type { OntologyDim } from './profile';
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
function choice(a: string, b: string, pick: 'a' | 'b' | 'both' | 'neither'): AppEvent {
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
