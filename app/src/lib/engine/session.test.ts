import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvent } from './events';
import { createModel } from './model';
import {
	advance,
	createSession,
	markAnswered,
	sessionMode,
	skipCurrent,
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
			strength: null,
			ms: null
		}));
		const ctx = ctxFor(pool, events);
		const engine = createSession(ctx, 5);
		expect(engine.state.mode).toBe('daily');
		expect(engine.state.current?.slot).not.toBe('calibration');
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
