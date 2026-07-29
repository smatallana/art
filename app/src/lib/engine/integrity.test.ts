/**
 * Event-fold integrity: infrastructure noise and undone events must never
 * reach the taste model (the external review found image failures being
 * folded in as negative preference).
 */
import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { effectiveEvents, isRetroactiveFoldEvent } from './events';
import { collectPairAnnotations, modelFromEvents } from './model';
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

	it('P0: neither + poor-image feedback changes NOTHING in the model', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const clean = modelFromEvents([], ctx);
		const flagged = modelFromEvents(
			[
				ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'neither', ms: null }),
				ev({
					t: 'pair_feedback',
					a: a.id,
					b: b.id,
					kind: 'pushed-away',
					aspects: ['image-quality']
				})
			],
			ctx
		);
		expect(flagged.observations).toBe(clean.observations);
	});

	it('both + hard-to-judge is masked symmetrically', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const flagged = modelFromEvents(
			[
				ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'both', ms: null }),
				ev({ t: 'pair_feedback', a: a.id, b: b.id, kind: 'shared', aspects: ['hard-to-judge'] })
			],
			ctx
		);
		expect(flagged.observations).toBe(0);
	});

	it('taste-only feedback on neither still counts (masking is content-only)', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const tasted = modelFromEvents(
			[
				ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'neither', ms: null }),
				ev({
					t: 'pair_feedback',
					a: a.id,
					b: b.id,
					kind: 'pushed-away',
					aspects: ['flat', 'no-pull']
				})
			],
			ctx
		);
		expect(tasted.observations).toBe(2);
	});

	it('un-toggling a content flag un-masks (last feedback wins)', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const events = [
			ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'neither', ms: null }),
			ev({ t: 'pair_feedback', a: a.id, b: b.id, kind: 'pushed-away', aspects: ['image-quality'] }),
			ev({ t: 'pair_feedback', a: a.id, b: b.id, kind: 'pushed-away', aspects: [] })
		];
		expect(modelFromEvents(events, ctx).observations).toBe(2);
		const ann = collectPairAnnotations(events);
		expect(ann.contentFlagged.size).toBe(0);
	});

	it('P0: strength levels produce different model states, keys canonicalized', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const withLevel = (level: string | null) =>
			modelFromEvents(
				[
					ev({ t: 'pair_choice', a: a.id, b: b.id, pick: 'a', ms: null }),
					// Reveal records strength as chosen/other — REVERSED key order here
					// on purpose: canonicalization must still find it.
					...(level ? [ev({ t: 'strength', a: b.id, b: a.id, level })] : [])
				],
				ctx
			);
		const slight = withLevel('slight');
		const clear = withLevel('clear');
		const strong = withLevel('strong');
		const dimId = [...strong.dims.keys()].find((k) => !k.startsWith('era.'));
		expect(dimId).toBeTruthy();
		const mu = (m: ReturnType<typeof modelFromEvents>) => Math.abs(m.dims.get(dimId!)!.mu);
		expect(mu(strong)).toBeGreaterThan(mu(clear));
		expect(mu(clear)).toBeGreaterThan(mu(slight));
	});

	it('isRetroactiveFoldEvent covers exactly strength and pair_feedback', () => {
		const a = pool[0]!;
		expect(isRetroactiveFoldEvent(ev({ t: 'strength', a: 'x', b: 'y', level: 'clear' }))).toBe(
			true
		);
		expect(
			isRetroactiveFoldEvent(
				ev({ t: 'pair_feedback', a: 'x', b: 'y', kind: 'shared', aspects: [] })
			)
		).toBe(true);
		expect(isRetroactiveFoldEvent(ev({ t: 'save', work: a.id }))).toBe(false);
		expect(
			isRetroactiveFoldEvent(ev({ t: 'pair_choice', a: 'x', b: 'y', pick: 'a', ms: null }))
		).toBe(false);
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
