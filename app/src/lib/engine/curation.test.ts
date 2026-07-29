import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import {
	anchorPool,
	curatePool,
	onboardingEligible,
	onboardingPool,
	type CuratedOnboarding
} from './curation';
import { historyFromEvents, recordShown, selectPair } from './selector';
import {
	advance,
	createSession,
	markAnswered,
	needsRecovery,
	type SessionContext
} from './session';
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

describe('onboardingPool (staged curated collection)', () => {
	const pool = testPool(120);
	const curated: CuratedOnboarding = {
		version: 1,
		works: pool.slice(0, 70).map((w, i) => ({
			id: w.id,
			stage: (i < 45 ? 1 : i < 60 ? 2 : 3) as 1 | 2 | 3,
			role: i % 3 === 0 ? 'anchor' : 'discovery'
		}))
	};

	it('gates by lifetime answers: stage 1 → ≤2 → all → heuristic', () => {
		const ids = (ws: Work[]) => new Set(ws.map((w) => w.id));
		const s1 = onboardingPool(pool, 0, curated);
		expect(s1.length).toBe(45);
		const s2 = onboardingPool(pool, 8, curated);
		expect(s2.length).toBe(60);
		const s3 = onboardingPool(pool, 16, curated);
		expect(s3.length).toBe(70);
		expect([...ids(s1)].every((id) => ids(s3).has(id))).toBe(true);
		// Past the gate: heuristic filter over the full pool, not the list.
		const post = onboardingPool(pool, 24, curated);
		expect(post.length).toBeGreaterThan(70);
	});

	it('cascades when a stage slice is too thin, and survives a missing list', () => {
		const thin: CuratedOnboarding = {
			version: 1,
			works: pool.slice(0, 45).map((w, i) => ({
				id: w.id,
				stage: (i < 10 ? 1 : 2) as 1 | 2,
				role: 'discovery' as const
			}))
		};
		// Stage-1 slice (10) is under the floor → whole collection (45).
		expect(onboardingPool(pool, 0, thin).length).toBe(45);
		// No list at all → heuristic filter.
		expect(onboardingPool(pool, 0, null).length).toBeGreaterThan(45);
		// List whose ids vanished from the catalog → heuristic filter.
		const stale: CuratedOnboarding = {
			version: 1,
			works: [{ id: 'gone-1', stage: 1, role: 'anchor' }]
		};
		expect(onboardingPool(pool, 0, stale).length).toBeGreaterThan(0);
	});

	it('anchorPool returns exactly the anchor-role works present in the pool', () => {
		const anchors = anchorPool(pool, curated);
		expect(anchors.length).toBe(curated.works.filter((w) => w.role === 'anchor').length);
		expect(anchorPool(pool, null)).toHaveLength(0);
	});
});

describe('session recovery (cold-streak repair)', () => {
	let seq = 0;
	function ev(payload: Record<string, unknown>, at?: string): AppEvent {
		return {
			id: `rc-${seq++}`,
			at: at ?? new Date(Date.now() + seq * 10).toISOString(),
			device: 't',
			hour: 12,
			...payload
		} as AppEvent;
	}

	it('needsRecovery triggers on 3 consecutive non-answers or 2 content flags', () => {
		const n = (pick: string) => ev({ t: 'pair_choice', a: 'x', b: 'y', pick, ms: null });
		expect(needsRecovery([n('neither'), n('unsure'), n('neither')])).toBe(true);
		expect(needsRecovery([n('neither'), n('a'), n('neither')])).toBe(false);
		expect(needsRecovery([n('neither'), n('neither')])).toBe(false);
		const flag = () =>
			ev({ t: 'pair_feedback', a: 'x', b: 'y', kind: 'unsure-why', aspects: ['image-quality'] });
		expect(needsRecovery([n('a'), flag(), flag()])).toBe(true);
		expect(needsRecovery([n('a'), flag()])).toBe(false);
	});

	it('the pair after a cold streak pivots to curated anchors', () => {
		const pool = testPool(120);
		const curated: CuratedOnboarding = {
			version: 1,
			// Plenty of anchors so the pivot pool clears its floor.
			works: pool
				.slice(0, 60)
				.map((w) => ({ id: w.id, stage: 1 as const, role: 'anchor' as const }))
		};
		const map = new Map(pool.map((w) => [w.id, w]));
		const events: AppEvent[] = [];
		const ctx: SessionContext = {
			works: pool,
			events,
			model: null,
			workById: (id) => map.get(id),
			seed: 9,
			curated
		};
		const engine = createSession(ctx, 6);
		const anchorIds = new Set(curated.works.map((w) => w.id));
		// Answer the first three pairs 'neither' (events stamped after startedAt).
		for (let i = 0; i < 3; i++) {
			const cur = engine.state.current!;
			events.push(
				ev(
					{ t: 'pair_choice', a: cur.aId, b: cur.bId, pick: 'neither', ms: null },
					new Date(Date.now() + 1000 + i).toISOString()
				)
			);
			markAnswered(engine);
			advance(engine, ctx);
		}
		const cur = engine.state.current!;
		expect(cur.recovery).toBe(true);
		expect(anchorIds.has(cur.aId)).toBe(true);
		expect(anchorIds.has(cur.bId)).toBe(true);
	});
});
