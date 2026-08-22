import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SELECTOR_OPTIONS,
	effectiveCooldowns,
	historyFromEvents,
	pairKey,
	recordShown,
	selectPair,
	type SelectionHistory
} from './selector';
import { testPool } from './testutil';
import { stratumOf } from './strata';

function freshHistory(): SelectionHistory {
	return {
		shownCount: new Map(),
		lastShownIndex: new Map(),
		artistLastIndex: new Map(),
		seenPairs: new Set(),
		interactionIndex: 0
	};
}

describe('selectPair', () => {
	it('never repeats a pair across a long run', () => {
		const pool = testPool(60);
		const h = freshHistory();
		const seen = new Set<string>();
		for (let i = 0; i < 40; i++) {
			const pair = selectPair(pool, h);
			expect(pair).not.toBeNull();
			const key = pairKey(pair!.a.id, pair!.b.id);
			expect(seen.has(key)).toBe(false);
			seen.add(key);
			recordShown(h, pair!.a, pair!.b);
		}
	});

	it('respects the effective artist cooldown', () => {
		const pool = testPool(60);
		const cd = effectiveCooldowns(pool, DEFAULT_SELECTOR_OPTIONS);
		const h = freshHistory();
		const artistLastSeen = new Map<string, number>();
		for (let i = 0; i < 30; i++) {
			const pair = selectPair(pool, h);
			expect(pair).not.toBeNull();
			for (const w of [pair!.a, pair!.b]) {
				const last = artistLastSeen.get(w.artist.name);
				if (last != null) {
					expect(i - last).toBeGreaterThanOrEqual(cd.artistCooldown - 1);
				}
				artistLastSeen.set(w.artist.name, i);
			}
			recordShown(h, pair!.a, pair!.b);
		}
	});

	it('covers many strata during calibration', () => {
		const pool = testPool(100);
		const h = freshHistory();
		const strataSeen = new Set<string>();
		for (let i = 0; i < 25; i++) {
			const pair = selectPair(pool, h);
			expect(pair).not.toBeNull();
			strataSeen.add(stratumOf(pair!.a));
			strataSeen.add(stratumOf(pair!.b));
			recordShown(h, pair!.a, pair!.b);
		}
		// 5 eras × 5 families exist in the pool; calibration should touch many.
		expect(strataSeen.size).toBeGreaterThanOrEqual(10);
	});

	it('avoids pairing extreme aspect mismatches', () => {
		const pool = testPool(60);
		const h = freshHistory();
		for (let i = 0; i < 20; i++) {
			const pair = selectPair(pool, h);
			const ratio =
				Math.max(pair!.a.images.aspect, pair!.b.images.aspect) /
				Math.min(pair!.a.images.aspect, pair!.b.images.aspect);
			expect(ratio).toBeLessThan(2.6);
			recordShown(h, pair!.a, pair!.b);
		}
	});

	it('returns null only when nothing is eligible', () => {
		const pool = testPool(4);
		const h = freshHistory();
		// exhaust the tiny pool
		let nulls = 0;
		for (let i = 0; i < 30; i++) {
			const pair = selectPair(pool, h, { maxShownPerWork: 2, workCooldown: 2 });
			if (!pair) {
				nulls++;
				h.interactionIndex++; // simulate time passing
				continue;
			}
			recordShown(h, pair.a, pair.b);
		}
		expect(nulls).toBeGreaterThan(0); // it did refuse rather than repeat forever
	});

	it('rebuilds identical history from events', () => {
		const events = [
			{
				id: '1',
				at: '2026-01-01T10:00:00Z',
				device: 'd',
				hour: 10,
				t: 'pair_choice' as const,
				a: 'w001',
				b: 'w002',
				pick: 'a' as const,
				ms: null
			}
		];
		const h = historyFromEvents(events);
		expect(h.interactionIndex).toBe(1);
		expect(h.shownCount.get('w001')).toBe(1);
		expect(h.seenPairs.has(pairKey('w001', 'w002'))).toBe(true);
	});
});

describe('historyFromEvents with pair_shown (durable repetition memory)', () => {
	const base = { device: 'd', hour: 10 };
	const shownEv = (id: string, a: string, b: string) => ({
		...base,
		id,
		at: `2026-01-01T10:00:0${id}Z`,
		t: 'pair_shown' as const,
		a,
		b
	});
	const choiceEv = (id: string, a: string, b: string) => ({
		...base,
		id,
		at: `2026-01-01T10:01:0${id}Z`,
		t: 'pair_choice' as const,
		a,
		b,
		pick: 'a' as const,
		ms: null
	});

	it('a shown-but-unanswered pair cools its works, its ARTISTS, and the pair', () => {
		const pool = testPool(60);
		const byId = new Map(pool.map((w) => [w.id, w]));
		const [wa, wb] = [pool[0]!, pool[1]!];
		const h = historyFromEvents([shownEv('1', wa.id, wb.id)], (id) => byId.get(id));
		expect(h.interactionIndex).toBe(1);
		expect(h.shownCount.get(wa.id)).toBe(1);
		expect(h.lastShownIndex.get(wb.id)).toBe(1);
		expect(h.artistLastIndex.get(wa.artist.name)).toBe(1);
		expect(h.artistLastIndex.get(wb.artist.name)).toBe(1);
		expect(h.seenPairs.has(pairKey(wa.id, wb.id))).toBe(true);
	});

	it('a shown pair that was then answered counts exactly once', () => {
		const h = historyFromEvents([shownEv('1', 'w001', 'w002'), choiceEv('2', 'w001', 'w002')]);
		expect(h.interactionIndex).toBe(1);
		expect(h.shownCount.get('w001')).toBe(1);
		expect(h.shownCount.get('w002')).toBe(1);
	});

	it('a choices-only log (pre-upgrade) behaves exactly as before', () => {
		const events = [choiceEv('1', 'w001', 'w002'), choiceEv('2', 'w003', 'w004')];
		const h = historyFromEvents(events);
		expect(h.interactionIndex).toBe(2);
		expect(h.shownCount.get('w003')).toBe(1);
		expect(h.lastShownIndex.get('w004')).toBe(2);
		// Without a workById resolver the artist cooldown stays unpopulated —
		// byte-identical to the pre-pair_shown behavior.
		expect(h.artistLastIndex.size).toBe(0);
		expect(h.seenPairs.has(pairKey('w003', 'w004'))).toBe(true);
	});

	it('an abandoned pair is never selected again, even after cooldowns lapse', () => {
		// Realistic pool: the abandoned pair's works recycle once the cooldown
		// window passes, but the exact pair stays blocked by seenPairs on the
		// novelty-respecting selection path. (The documented terminal fallback
		// relaxes pair-novelty only when EVERY novel combination is exhausted —
		// unreachable at catalog scale, so it is out of scope here.)
		const pool = testPool(60);
		const [wa, wb] = [pool[0]!, pool[1]!];
		const abandoned = pairKey(wa.id, wb.id);
		const h = historyFromEvents([shownEv('1', wa.id, wb.id)]);
		for (let i = 0; i < 30; i++) {
			const pair = selectPair(pool, h, { seed: i + 1 });
			if (!pair) {
				h.interactionIndex++;
				continue;
			}
			expect(pairKey(pair.a.id, pair.b.id)).not.toBe(abandoned);
			recordShown(h, pair.a, pair.b);
		}
	});
});
