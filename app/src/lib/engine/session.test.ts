import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvent } from './events';
import { createModel } from './model';
import {
	advance,
	createSession,
	DEFAULT_SESSION_LENGTH,
	FIRST_SESSION_LENGTH,
	finishEarly,
	markAnswered,
	resumeSession,
	sessionLengthFor,
	sessionMode,
	skipCurrent,
	smartShare,
	type SessionContext
} from './session';
import { testPool } from './testutil';

beforeEach(() => {
	if (!globalThis.crypto?.randomUUID) {
		vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` });
	}
});

function ctxFor(pool: ReturnType<typeof testPool>, events: AppEvent[] = []): SessionContext {
	const map = new Map(pool.map((w) => [w.id, w]));
	return {
		works: pool,
		events,
		model: createModel(),
		workById: (id) => map.get(id),
		seed: 42
	};
}

describe('session engine', () => {
	it('walks a full session to completion', () => {
		const pool = testPool(80);
		const ctx = ctxFor(pool);
		const engine = createSession(ctx, 5);
		expect(engine.state.mode).toBe('calibration');
		let answered = 0;
		while (engine.state.phase !== 'done') {
			expect(engine.state.current).not.toBeNull();
			markAnswered(engine);
			answered++;
			expect(engine.state.phase).toBe('revealed');
			advance(engine, ctx);
			if (answered > 20) throw new Error('session never finished');
		}
		expect(answered).toBe(5);
	});

	it('skip does not consume session length', () => {
		const pool = testPool(80);
		const ctx = ctxFor(pool);
		const engine = createSession(ctx, 3);
		skipCurrent(engine, ctx);
		expect(engine.state.position).toBe(0);
		expect(engine.state.phase).toBe('choosing');
		expect(engine.state.current).not.toBeNull();
	});

	it('switches to daily mode after the calibration target', () => {
		expect(sessionMode(0)).toBe('calibration');
		expect(sessionMode(39)).toBe('calibration');
		expect(sessionMode(40)).toBe('daily');
	});

	it('daily mode uses the active learner and labels slots', () => {
		const pool = testPool(120);
		// 40 synthetic answered pairs → daily mode
		const events: AppEvent[] = Array.from({ length: 40 }, (_, i) => ({
			id: `e${i}`,
			at: new Date(1700000000000 + i * 1000).toISOString(),
			device: 'd',
			hour: 12,
			t: 'pair_choice' as const,
			a: pool[(i * 2) % pool.length]!.id,
			b: pool[(i * 2 + 1) % pool.length]!.id,
			pick: 'a' as const,
			ms: null
		}));
		const ctx = ctxFor(pool, events);
		const engine = createSession(ctx, 5);
		expect(engine.state.mode).toBe('daily');
		expect(engine.state.current?.slot).not.toBe('calibration');
	});

	it('stamps a test objective only on daily-mode sessions', () => {
		const pool = testPool(120);
		const objective = {
			dims: ['color.saturation'],
			label: 'vivid color',
			createdAt: new Date().toISOString()
		};
		// Calibration (no prior answers): the promise cannot be honored → dropped.
		const calCtx = { ...ctxFor(pool), objective };
		const cal = createSession(calCtx, 5);
		expect(cal.state.mode).toBe('calibration');
		expect(cal.state.objective).toBeUndefined();

		// Daily (40 prior answers): stamped, and targeted slots appear.
		const events: AppEvent[] = Array.from({ length: 40 }, (_, i) => ({
			id: `e${i}`,
			at: new Date(1700000000000 + i * 1000).toISOString(),
			device: 'd',
			hour: 12,
			t: 'pair_choice' as const,
			a: pool[(i * 2) % pool.length]!.id,
			b: pool[(i * 2 + 1) % pool.length]!.id,
			pick: 'a' as const,
			ms: null
		}));
		const dailyCtx = { ...ctxFor(pool, events), objective };
		const engine = createSession(dailyCtx, 12);
		expect(engine.state.mode).toBe('daily');
		expect(engine.state.objective).toEqual({ dims: ['color.saturation'], label: 'vivid color' });
		const slots = new Set<string>();
		while (engine.state.phase !== 'done' && engine.state.current) {
			slots.add(engine.state.current.slot);
			markAnswered(engine);
			advance(engine, dailyCtx);
		}
		expect(slots.has('targeted')).toBe(true);
	});

	it('the objective survives a snapshot round-trip (resume)', () => {
		const pool = testPool(80);
		const ctx = ctxFor(pool);
		const engine = createSession(ctx, 5);
		engine.state.objective = { dims: ['color.saturation'], label: 'vivid color' };
		const snapshot = JSON.parse(JSON.stringify(engine.state));
		const resumed = resumeSession(snapshot, [], (id) => pool.find((w) => w.id === id));
		expect(resumed.state.objective).toEqual({ dims: ['color.saturation'], label: 'vivid color' });
	});

	it('never shows the same pair twice within a run', () => {
		const pool = testPool(80);
		const ctx = ctxFor(pool);
		const engine = createSession(ctx, 10);
		const seen = new Set<string>();
		while (engine.state.phase !== 'done' && engine.state.current) {
			const key = [engine.state.current.aId, engine.state.current.bId].sort().join('::');
			expect(seen.has(key)).toBe(false);
			seen.add(key);
			markAnswered(engine);
			advance(engine, ctx);
		}
		expect(seen.size).toBe(10);
	});
});

function priorAnswers(pool: ReturnType<typeof testPool>, n: number): AppEvent[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `p${i}`,
		at: new Date(1700000000000 + i * 1000).toISOString(),
		device: 'd',
		hour: 12,
		t: 'pair_choice' as const,
		a: pool[(i * 2) % pool.length]!.id,
		b: pool[(i * 2 + 1) % pool.length]!.id,
		pick: 'a' as const,
		ms: null
	}));
}

describe('session lengths (tramo 9 — short first sitting)', () => {
	it('first sitting is 6, later sittings default to 8', () => {
		expect(sessionLengthFor(0)).toBe(FIRST_SESSION_LENGTH);
		expect(sessionLengthFor(5)).toBe(FIRST_SESSION_LENGTH);
		expect(sessionLengthFor(6)).toBe(DEFAULT_SESSION_LENGTH);
		expect(sessionLengthFor(100)).toBe(DEFAULT_SESSION_LENGTH);
	});

	it('createSession derives length from lifetime answers when not given one', () => {
		const pool = testPool(80);
		expect(createSession(ctxFor(pool)).state.length).toBe(FIRST_SESSION_LENGTH);
		expect(createSession(ctxFor(pool, priorAnswers(pool, 10))).state.length).toBe(
			DEFAULT_SESSION_LENGTH
		);
		// An explicit length (voluntary long sitting, sharpen continuation) wins.
		expect(createSession(ctxFor(pool), 12).state.length).toBe(12);
	});
});

describe('finishEarly', () => {
	function answered(ctx: SessionContext, n: number) {
		const engine = createSession(ctx, 6);
		for (let i = 0; i < n; i++) {
			markAnswered(engine);
			advance(engine, ctx);
		}
		return engine;
	}

	it('closes the session in place with enough answers to summarize', () => {
		const ctx = ctxFor(testPool(80));
		const engine = answered(ctx, 3);
		finishEarly(engine);
		expect(engine.state.phase).toBe('done');
		expect(engine.state.current).toBeNull();
		expect(engine.state.length).toBe(3); // progress reads honestly
		expect(engine.state.endedEarly).toBe(true);
	});

	it('is a no-op under the summary floor', () => {
		const ctx = ctxFor(testPool(80));
		const engine = answered(ctx, 2);
		finishEarly(engine);
		expect(engine.state.phase).toBe('choosing');
		expect(engine.state.current).not.toBeNull();
		expect(engine.state.endedEarly).toBeUndefined();
	});
});

describe('progressive personalization during calibration', () => {
	it('bands: none while the opening runs, then a third, then half', () => {
		expect(smartShare(0)).toBe(0);
		expect(smartShare(5)).toBe(0);
		expect(smartShare(6)).toBe(0.3);
		expect(smartShare(19)).toBe(0.3);
		expect(smartShare(20)).toBe(0.5);
		expect(smartShare(39)).toBe(0.5);
		expect(smartShare(40)).toBe(1);
	});

	function smartFraction(prior: number, seeds: number[]): number {
		const pool = testPool(120);
		let smart = 0;
		let total = 0;
		for (const seed of seeds) {
			const ctx = { ...ctxFor(pool, priorAnswers(pool, prior)), seed };
			const engine = createSession(ctx, 8);
			while (engine.state.phase !== 'done' && engine.state.current) {
				total++;
				if (engine.state.current.slot !== 'calibration') smart++;
				markAnswered(engine);
				advance(engine, ctx);
			}
		}
		return smart / total;
	}

	const seeds = Array.from({ length: 40 }, (_, i) => i * 13 + 1);

	it('a fresh profile gets zero smart pairs', () => {
		expect(smartFraction(0, seeds.slice(0, 10))).toBe(0);
	});

	it('the 0.3 band lands near a third and the 0.5 band near half', () => {
		const early = smartFraction(12, seeds);
		expect(early).toBeGreaterThanOrEqual(0.15);
		expect(early).toBeLessThanOrEqual(0.45);
		const later = smartFraction(25, seeds);
		expect(later).toBeGreaterThanOrEqual(0.35);
		expect(later).toBeLessThanOrEqual(0.65);
		expect(later).toBeGreaterThan(early);
	});

	it('the draw is deterministic for a given seed', () => {
		const pool = testPool(120);
		const walk = () => {
			const ctx = { ...ctxFor(pool, priorAnswers(pool, 12)), seed: 7 };
			const engine = createSession(ctx, 8);
			const ids: string[] = [];
			while (engine.state.phase !== 'done' && engine.state.current) {
				ids.push(engine.state.current.aId, engine.state.current.bId, engine.state.current.slot);
				markAnswered(engine);
				advance(engine, ctx);
			}
			return ids.join('|');
		};
		expect(walk()).toBe(walk());
	});
});
