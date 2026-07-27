import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, createSession, markAnswered, sessionMode, skipCurrent } from './session';
import { testPool } from './testutil';

beforeEach(() => {
	// jsdom-free environment: provide crypto.randomUUID when missing
	if (!globalThis.crypto?.randomUUID) {
		vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` });
	}
});

describe('session engine', () => {
	it('walks a full session to completion', () => {
		const pool = testPool(80);
		const engine = createSession([], pool, 42, 5);
		expect(engine.state.mode).toBe('calibration');
		let answered = 0;
		while (engine.state.phase !== 'done') {
			expect(engine.state.current).not.toBeNull();
			markAnswered(engine);
			answered++;
			expect(engine.state.phase).toBe('revealed');
			advance(engine, pool, 42);
			if (answered > 20) throw new Error('session never finished');
		}
		expect(answered).toBe(5);
	});

	it('skip does not consume session length', () => {
		const pool = testPool(80);
		const engine = createSession([], pool, 7, 3);
		skipCurrent(engine, pool, 7);
		expect(engine.state.position).toBe(0);
		expect(engine.state.phase).toBe('choosing');
		expect(engine.state.current).not.toBeNull();
	});

	it('switches to daily mode after the calibration target', () => {
		expect(sessionMode(0)).toBe('calibration');
		expect(sessionMode(39)).toBe('calibration');
		expect(sessionMode(40)).toBe('daily');
	});

	it('never shows the same pair twice within a run', () => {
		const pool = testPool(80);
		const engine = createSession([], pool, 3, 10);
		const seen = new Set<string>();
		while (engine.state.phase !== 'done' && engine.state.current) {
			const key = [engine.state.current.aId, engine.state.current.bId].sort().join('::');
			expect(seen.has(key)).toBe(false);
			seen.add(key);
			markAnswered(engine);
			advance(engine, pool, 3);
		}
		expect(seen.size).toBe(10);
	});
});
