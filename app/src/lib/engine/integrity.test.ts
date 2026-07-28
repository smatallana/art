/**
 * Event-fold integrity: infrastructure noise and undone events must never
 * reach the taste model (the external review found image failures being
 * folded in as negative preference).
 */
import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { effectiveEvents } from './events';
import { modelFromEvents } from './model';
import { testPool } from './testutil';

const pool = testPool();
const ctx = { workById: (id: string) => pool.find((w) => w.id === id) };

let seq = 0;
function ev(payload: Record<string, unknown>): AppEvent {
	return {
		id: `it-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 'test',
		hour: 12,
		...payload
	} as AppEvent;
}

describe('fold integrity', () => {
	it('image_error events change nothing in the model', () => {
		const clean = modelFromEvents([], ctx);
		const noisy = modelFromEvents(
			pool.slice(0, 5).map((w) => ev({ t: 'image_error', work: w.id, context: 'session' })),
			ctx
		);
		expect(noisy.observations).toBe(clean.observations);
		expect(noisy.dims.size).toBe(clean.dims.size);
	});

	it('legacy not-now skips (auto-emitted on image failures) carry no signal', () => {
		const legacy = modelFromEvents(
			pool.slice(0, 5).map((w) => ev({ t: 'skip', work: w.id, reason: 'not-now' })),
			ctx
		);
		expect(legacy.observations).toBe(0);
	});

	it('deliberate user passes DO carry weak signal', () => {
		const passed = modelFromEvents(
			pool.slice(0, 5).map((w) => ev({ t: 'skip', work: w.id, reason: 'pass' })),
			ctx
		);
		expect(passed.observations).toBe(5);
	});

	it('undo tombstones mask their targets and themselves', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const choice = ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'a', ms: null });
		const save = ev({ t: 'save', work: a.id });
		const undo = ev({ t: 'undo', ids: [choice.id, save.id] });
		const live = effectiveEvents([choice, save, undo]);
		expect(live).toHaveLength(0);
		const undone = modelFromEvents([choice, save, undo], ctx);
		expect(undone.observations).toBe(0);
		// Without the tombstone the same events do count.
		const kept = modelFromEvents([choice, save], ctx);
		expect(kept.observations).toBeGreaterThan(0);
	});
});
