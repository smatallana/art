import { describe, expect, it } from 'vitest';
import { selectPairSmart, type SlotKind } from './active';
import type { AppEvent } from './events';
import { createModel, modelFromEvents } from './model';
import { historyFromEvents, recordShown } from './selector';
import { testPool } from './testutil';

function ctxFor(
	pool: ReturnType<typeof testPool>
): (id: string) => (typeof pool)[number] | undefined {
	const map = new Map(pool.map((w) => [w.id, w]));
	return (id) => map.get(id);
}

describe('selectPairSmart', () => {
	it('mixes slots: information dominates, exploration and challenge present', () => {
		const pool = testPool(150);
		const model = createModel();
		const h = historyFromEvents([]);
		const counts: Record<SlotKind, number> = {
			information: 0,
			exploration: 0,
			challenge: 0,
			refutation: 0,
			consistency: 0,
			targeted: 0
		};
		for (let i = 0; i < 60; i++) {
			const pair = selectPairSmart(pool, h, model, [], ctxFor(pool), { seed: i * 13 + 1 });
			expect(pair).not.toBeNull();
			counts[pair!.slot]++;
			recordShown(h, pair!.a, pair!.b);
		}
		expect(counts.information).toBeGreaterThan(20);
		expect(counts.exploration).toBeGreaterThan(2);
		expect(counts.challenge).toBeGreaterThan(1);
		expect(counts.refutation).toBe(0); // no provisional dims → no refutation slot
	});

	it('schedules refutation probes when provisional dims exist', () => {
		const pool = testPool(150);
		const priorEvent: AppEvent = {
			id: 'p1',
			at: '2026-01-01T00:00:00Z',
			device: 'd',
			hour: 9,
			t: 'prior_import',
			spec: {
				version: 1,
				label: 'test',
				weights: { 'color.saturation': -0.6 },
				artists: {},
				uncertain: []
			}
		};
		const model = modelFromEvents([priorEvent], { workById: ctxFor(pool) });
		expect(model.dims.get('color.saturation')?.provisional).toBe(true);
		const h = historyFromEvents([]);
		let refutations = 0;
		for (let i = 0; i < 40; i++) {
			const pair = selectPairSmart(pool, h, model, [priorEvent], ctxFor(pool), { seed: i * 7 + 3 });
			if (pair!.slot === 'refutation') {
				refutations++;
				// the pair must actually contrast the targeted dim
				const va = pair!.a.tags['color.saturation']?.v ?? 0.5;
				const vb = pair!.b.tags['color.saturation']?.v ?? 0.5;
				expect(Math.abs(va - vb)).toBeGreaterThan(0.2);
			}
			recordShown(h, pair!.a, pair!.b);
		}
		expect(refutations).toBeGreaterThan(3);
	});

	it('a session objective produces targeted pairs that contrast the dim', () => {
		const pool = testPool(150);
		const model = createModel();
		const h = historyFromEvents([]);
		let targeted = 0;
		for (let i = 0; i < 60; i++) {
			const pair = selectPairSmart(pool, h, model, [], ctxFor(pool), {
				seed: i * 13 + 1,
				targetDims: ['color.saturation']
			});
			expect(pair).not.toBeNull();
			if (pair!.slot === 'targeted') {
				targeted++;
				const va = pair!.a.tags['color.saturation']?.v ?? 0.5;
				const vb = pair!.b.tags['color.saturation']?.v ?? 0.5;
				expect(Math.abs(va - vb)).toBeGreaterThan(0.2);
			}
			recordShown(h, pair!.a, pair!.b);
		}
		// ~44% of turns while the objective is active; wide tolerance for RNG.
		expect(targeted).toBeGreaterThan(15);
		expect(targeted).toBeLessThan(45);
	});

	it('an objective with no honest contrast degrades, never starves', () => {
		const pool = testPool(150);
		const model = createModel();
		const h = historyFromEvents([]);
		for (let i = 0; i < 30; i++) {
			// 'mood.serenity' is absent from the fixture pool's tags: no pair can
			// contrast it, so targeted must fall through to another slot.
			const pair = selectPairSmart(pool, h, model, [], ctxFor(pool), {
				seed: i * 17 + 5,
				targetDims: ['mood.serenity']
			});
			expect(pair).not.toBeNull();
			expect(pair!.slot).not.toBe('targeted');
			recordShown(h, pair!.a, pair!.b);
		}
	});

	it('without an objective the slot mix is unchanged (regression pin)', () => {
		const pool = testPool(150);
		const model = createModel();
		const h1 = historyFromEvents([]);
		const h2 = historyFromEvents([]);
		for (let i = 0; i < 20; i++) {
			const bare = selectPairSmart(pool, h1, model, [], ctxFor(pool), { seed: i * 13 + 1 });
			const empty = selectPairSmart(pool, h2, model, [], ctxFor(pool), {
				seed: i * 13 + 1,
				targetDims: []
			});
			expect(empty!.slot).toBe(bare!.slot);
			expect(empty!.a.id).toBe(bare!.a.id);
			recordShown(h1, bare!.a, bare!.b);
			recordShown(h2, empty!.a, empty!.b);
		}
	});

	it('emits a consistency probe around every 15th interaction', () => {
		const pool = testPool(150);
		const model = createModel();
		// history with 14 answered pairs → next selection should probe
		const events: AppEvent[] = [];
		const h = historyFromEvents([]);
		for (let i = 0; i < 14; i++) {
			const pair = selectPairSmart(pool, h, model, events, ctxFor(pool), { seed: i + 500 });
			recordShown(h, pair!.a, pair!.b);
			events.push({
				id: `e${i}`,
				at: new Date(1700000000000 + i * 1000).toISOString(),
				device: 'd',
				hour: 12,
				t: 'pair_choice',
				a: pair!.a.id,
				b: pair!.b.id,
				pick: 'a',
				ms: null
			});
		}
		const probe = selectPairSmart(pool, h, model, events, ctxFor(pool), { seed: 999 });
		expect(probe!.slot).toBe('consistency');
		// swapped sides of a previously seen pair
		const key = [probe!.a.id, probe!.b.id].sort().join('::');
		const seenKeys = events.map((e) => (e.t === 'pair_choice' ? [e.a, e.b].sort().join('::') : ''));
		expect(seenKeys).toContain(key);
	});
});
