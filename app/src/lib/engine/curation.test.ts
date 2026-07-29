import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../catalog/types';
import { curatePool, onboardingEligible } from './curation';
import { historyFromEvents, recordShown, selectPair } from './selector';
import { advance, createSession, markAnswered, type SessionContext } from './session';
import { testPool, testWork } from './testutil';

beforeEach(() => {
	if (!globalThis.crypto?.randomUUID) {
		vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` });
	}
});

describe('onboardingEligible', () => {
	it('accepts a standard catalog work', () => {
		expect(onboardingEligible(testWork('ok'))).toBe(true);
	});

	it('rejects low resolution, extreme aspect, specialist media, low quality', () => {
		const narrow = testWork('narrow');
		narrow.images.width = 500;
		expect(onboardingEligible(narrow)).toBe(false);

		expect(onboardingEligible(testWork('wide', { aspect: 3.2 }))).toBe(false);

		const leaf = testWork('leaf');
		leaf.medium = 'Album leaf; ink and color on silk';
		expect(onboardingEligible(leaf)).toBe(false);

		const scroll = testWork('scroll');
		scroll.medium = 'Handscroll, ink on paper';
		expect(onboardingEligible(scroll)).toBe(false);

		const poor = testWork('poor');
		poor.quality.score = 0.35;
		expect(onboardingEligible(poor)).toBe(false);
	});

	it('does not reject unrelated media containing similar substrings', () => {
		const fantasy = testWork('fant');
		fantasy.medium = 'Oil on canvas; fantastical scene';
		expect(onboardingEligible(fantasy)).toBe(true);
	});
});

describe('curatePool', () => {
	it('filters ineligible works from a big pool', () => {
		const pool = testPool(100);
		const spoiled = pool.map((w, i) => {
			if (i % 2 === 0) return { ...w, medium: 'Album leaf; ink on silk' };
			return w;
		});
		const kept = curatePool(spoiled);
		expect(kept.length).toBe(50);
		expect(kept.every((w) => onboardingEligible(w))).toBe(true);
	});

	it('passes tiny pools through unfiltered (selector must not starve)', () => {
		const pool = testPool(20).map((w) => ({ ...w, medium: 'Album leaf' }));
		expect(curatePool(pool)).toHaveLength(20);
	});
});

describe('onboarding arc', () => {
	it('opens with era contrasts, then subject contrasts', () => {
		const works = testPool(60);
		const h = historyFromEvents([]);
		const probes: string[] = [];
		for (let i = 0; i < 8; i++) {
			const p = selectPair(works, h, { seed: 3 });
			if (!p) throw new Error(`no pair at ${i}`);
			probes.push(p.probe);
			recordShown(h, p.a, p.b);
		}
		expect(probes.slice(0, 4)).toEqual(['cross-era', 'cross-era', 'cross-era', 'cross-era']);
		expect(probes.slice(4, 8)).toEqual([
			'cross-subject',
			'cross-subject',
			'cross-subject',
			'cross-subject'
		]);
	});
});

describe('per-source session cap', () => {
	function ctxFor(works: Work[]): SessionContext {
		const map = new Map(works.map((w) => [w.id, w]));
		return { works, events: [], model: null, workById: (id) => map.get(id), seed: 7 };
	}

	function runSession(works: Work[], length: number): Map<string, number> {
		const ctx = ctxFor(works);
		const engine = createSession(ctx, length);
		let guard = 0;
		while (engine.state.phase !== 'done' && engine.state.current) {
			markAnswered(engine);
			advance(engine, ctx);
			if (++guard > 40) throw new Error('session never finished');
		}
		return engine.sourceShown;
	}

	it('keeps a dominant source under control within a session', () => {
		// 2/3 of the pool from one source — unconstrained selection would follow.
		const works = testPool(90).map((w, i) => ({
			...w,
			source: (i < 60 ? 'cma' : i < 75 ? 'aic' : 'wd') as Work['source']
		}));
		const shown = runSession(works, 12);
		const total = [...shown.values()].reduce((a, n) => a + n, 0);
		expect(total).toBe(24);
		// The cap engages after 8 shown works; allow the pre-cap head start.
		expect((shown.get('cma') ?? 0) / total).toBeLessThanOrEqual(0.55);
	});

	it('single-source pools still complete (cap falls back, never starves)', () => {
		const works = testPool(80); // all source 'dev'
		const shown = runSession(works, 10);
		expect([...shown.values()].reduce((a, n) => a + n, 0)).toBe(20);
	});
});
