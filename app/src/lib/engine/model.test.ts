import { describe, expect, it } from 'vitest';
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import {
	createModel,
	evidenceTier,
	features,
	isConflicted,
	modelFromEvents,
	preferProbability,
	utility,
	type TasteModel
} from './model';
import { mulberry32 } from './random';
import { historyFromEvents, recordShown, selectPair } from './selector';
import { testPool, testWork } from './testutil';

/** Simulate a user whose true taste is a weight vector over dims. */
function syntheticChoice(
	trueWeights: Record<string, number>,
	a: Work,
	b: Work,
	rng: () => number,
	noise = 0.15
): 'a' | 'b' {
	const score = (w: Work): number => {
		let s = 0;
		for (const [id, x] of features(w)) s += (trueWeights[id] ?? 0) * x;
		return s;
	};
	const p = 1 / (1 + Math.exp(-(score(a) - score(b)) / Math.max(noise, 1e-6)));
	return rng() < p ? 'a' : 'b';
}

function simulate(
	trueWeights: Record<string, number>,
	pool: Work[],
	nChoices: number,
	seedBase = 11,
	noise = 0.15
): AppEvent[] {
	const rng = mulberry32(seedBase);
	const events: AppEvent[] = [];
	const h = historyFromEvents([]);
	for (let i = 0; i < nChoices; i++) {
		const pair = selectPair(pool, h, { seed: seedBase + i });
		if (!pair) break;
		recordShown(h, pair.a, pair.b);
		const pick = syntheticChoice(trueWeights, pair.a, pair.b, rng, noise);
		events.push({
			id: `e${i}`,
			at: new Date(1700000000000 + i * 60000).toISOString(),
			device: 'sim',
			hour: 12,
			t: 'pair_choice',
			a: pair.a.id,
			b: pair.b.id,
			pick,
			ms: null
		});
	}
	return events;
}

function ctxFor(pool: Work[]): { workById: (id: string) => Work | undefined } {
	const map = new Map(pool.map((w) => [w.id, w]));
	return { workById: (id) => map.get(id) };
}

describe('taste model convergence (synthetic users)', () => {
	it('recovers a planted subject preference with correct sign and evidence', () => {
		const pool = testPool(120);
		// User loves landscapes, dislikes still lifes.
		const truth = { 'subject.landscape': 2.5, 'subject.stilllife': -2.5 };
		const events = simulate(truth, pool, 60, 7);
		const model = modelFromEvents(events, ctxFor(pool));

		const landscape = model.dims.get('subject.landscape');
		const still = model.dims.get('subject.stilllife');
		expect(landscape).toBeDefined();
		expect(still).toBeDefined();
		expect(landscape!.mu).toBeGreaterThan(0);
		expect(still!.mu).toBeLessThan(0);
		expect(['strong', 'moderate']).toContain(evidenceTier(landscape!));
		expect(['strong', 'moderate']).toContain(evidenceTier(still!));
	});

	it('ranks unseen works consistently with the planted taste', () => {
		const pool = testPool(120);
		const truth = { 'subject.portrait': 2.0, 'color.saturation': -1.5 };
		const events = simulate(truth, pool, 80, 3);
		const model = modelFromEvents(events, ctxFor(pool));

		const portraitMuted = testWork('x-1', {
			tags: { 'subject.portrait': 1, 'color.saturation': 0.1 }
		});
		const abstractVivid = testWork('x-2', {
			tags: { 'form.abstraction': 0.9, 'color.saturation': 0.9 }
		});
		const p = preferProbability(model, features(portraitMuted), features(abstractVivid));
		expect(p).toBeGreaterThan(0.75);
	});

	it('leaves untested dimensions at insufficient evidence', () => {
		const pool = testPool(120);
		const events = simulate({ 'subject.landscape': 2 }, pool, 25, 5);
		const model = modelFromEvents(events, ctxFor(pool));
		// mood dims never appear in the synthetic pool tags
		const mood = model.dims.get('mood.melancholy');
		expect(mood == null || evidenceTier(mood) === 'insufficient').toBe(true);
	});

	it('a random (tasteless) user produces no strong claims on subject dims', () => {
		const pool = testPool(120);
		const events = simulate({}, pool, 70, 13, 5); // huge noise → coin flips
		const model = modelFromEvents(events, ctxFor(pool));
		for (const id of ['subject.landscape', 'subject.portrait', 'subject.stilllife']) {
			const d = model.dims.get(id);
			if (d) expect(evidenceTier(d)).not.toBe('strong');
		}
	});

	it('detects planted contradictions (era-dependent reversal) as conflict', () => {
		const pool = testPool(160);
		const rng = mulberry32(21);
		const events: AppEvent[] = [];
		const h = historyFromEvents([]);
		// Loves saturation in modern works, hates it in older works → the
		// single color.saturation dim receives opposing evidence.
		for (let i = 0; i < 80; i++) {
			const pair = selectPair(pool, h, { seed: 100 + i });
			if (!pair) break;
			recordShown(h, pair.a, pair.b);
			const score = (w: Work): number => {
				const sat = (w.tags['color.saturation']?.v ?? 0.5) - 0.5;
				const modern = (w.date.start ?? 0) >= 1850 ? 1 : -1;
				return 3 * sat * modern;
			};
			const p = 1 / (1 + Math.exp(-(score(pair.a) - score(pair.b)) / 0.2));
			events.push({
				id: `e${i}`,
				at: new Date(1700000000000 + i * 60000).toISOString(),
				device: 'sim',
				hour: 12,
				t: 'pair_choice',
				a: pair.a.id,
				b: pair.b.id,
				pick: rng() < p ? 'a' : 'b',
				ms: null
			});
		}
		const model = modelFromEvents(events, ctxFor(pool));
		const sat = model.dims.get('color.saturation');
		expect(sat).toBeDefined();
		expect(sat!.n).toBeGreaterThan(8);
		// Either flagged as conflicted or at least not confidently one-sided.
		expect(isConflicted(sat!) || evidenceTier(sat!) !== 'strong').toBe(true);
	});

	it('raises temperature when consistency probes disagree', () => {
		const pool = testPool(40);
		const a = pool[0] as Work;
		const b = pool[1] as Work;
		const mk = (i: number, pick: 'a' | 'b'): AppEvent => ({
			id: `c${i}`,
			at: new Date(1700000000000 + i * 60000).toISOString(),
			device: 'sim',
			hour: 12,
			t: 'pair_choice',
			a: a.id,
			b: b.id,
			pick,
			ms: null
		});
		const inconsistent = modelFromEvents(
			[mk(0, 'a'), mk(1, 'b'), mk(2, 'a'), mk(3, 'b')],
			ctxFor(pool)
		);
		expect(inconsistent.temperature).toBeGreaterThan(1.4);
		const consistent = modelFromEvents(
			[mk(0, 'a'), mk(1, 'a'), mk(2, 'a'), mk(3, 'a')],
			ctxFor(pool)
		);
		expect(consistent.temperature).toBeLessThan(1.1);
	});

	it('weak signals (saves/skips) nudge without overwhelming', () => {
		const pool = testPool(60);
		const w = pool.find((x) => (x.tags['subject.landscape']?.v ?? 0) > 0.5) as Work;
		const saveEvents: AppEvent[] = [0, 1, 2].map((i) => ({
			id: `s${i}`,
			at: new Date(1700000000000 + i * 60000).toISOString(),
			device: 'sim',
			hour: 12,
			t: 'save',
			work: w.id
		}));
		const model = modelFromEvents(saveEvents, ctxFor(pool));
		const d = model.dims.get('subject.landscape');
		expect(d).toBeDefined();
		expect(d!.mu).toBeGreaterThan(0);
		expect(evidenceTier(d!)).not.toBe('strong'); // saves alone can't be "strong"
	});
});

describe('utility', () => {
	it('accumulates mean and variance over features', () => {
		const model: TasteModel = createModel();
		model.dims.set('subject.landscape', {
			mu: 1,
			variance: 0.2,
			n: 10,
			signAgreement: 0.8,
			provisional: false
		});
		const w = testWork('u1', { tags: { 'subject.landscape': 1 } });
		const { mean, variance } = utility(model, features(w));
		expect(mean).toBeGreaterThan(0);
		expect(variance).toBeGreaterThan(0);
	});
});
