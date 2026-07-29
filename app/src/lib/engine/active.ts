/**
 * Active pair selection (daily mode): generate candidates under the same
 * fairness constraints as calibration, then allocate each turn to a slot:
 *
 *   ~15%  exploration — stratified random, keeps the map wide open
 *   ~10%  challenge   — low predicted appeal but high uncertainty, so the
 *                       bubble never closes
 *   ~20%  refutation  — targets a provisional (imported) dimension with a
 *                       pair that differs mainly along it
 *   1/15  consistency — a previously answered pair, sides swapped
 *   rest  information — maximise expected information gain
 *                       p(1−p) · Σ_d σ²_d Δφ_d²
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import { features, preferProbability, type TasteModel } from './model';
import { mulberry32 } from './random';
import {
	candidatePairs,
	selectPair,
	type SelectedPair,
	type SelectionHistory,
	type SelectorOptions
} from './selector';

export type SlotKind =
	'information' | 'exploration' | 'challenge' | 'refutation' | 'consistency' | 'targeted';

export interface SmartPair extends SelectedPair {
	slot: SlotKind;
}

/** Options for the smart selector; the base constraints pass through to
 *  candidate generation, targetDims activates the session objective. */
export interface SmartOptions extends Partial<SelectorOptions> {
	/** Dims the session was explicitly asked to test ("Test this pattern"). */
	targetDims?: readonly string[];
}

function infoGain(model: TasteModel, a: Work, b: Work, target?: ReadonlySet<string>): number {
	const fa = features(a);
	const fb = features(b);
	const p = preferProbability(model, fa, fb);
	let weighted = 0;
	const keys = new Set([...fa.keys(), ...fb.keys()]);
	for (const k of keys) {
		const dx = (fa.get(k) ?? 0) - (fb.get(k) ?? 0);
		const variance = model.dims.get(k)?.variance ?? 1;
		// Objective dims count triple: even non-targeted turns lean toward
		// the question the user asked the session to answer.
		weighted += (target?.has(k) ? 3 : 1) * variance * dx * dx;
	}
	return p * (1 - p) * weighted;
}

function provisionalDims(model: TasteModel): string[] {
	const out: string[] = [];
	for (const [id, d] of model.dims) if (d.provisional) out.push(id);
	return out;
}

/** |Δφ_target| high while other differences stay small → isolates the dim. */
function refutationScore(target: string, a: Work, b: Work): number {
	const fa = features(a);
	const fb = features(b);
	const dTarget = Math.abs((fa.get(target) ?? 0) - (fb.get(target) ?? 0));
	if (dTarget < 0.15) return 0;
	let other = 0;
	const keys = new Set([...fa.keys(), ...fb.keys()]);
	for (const k of keys) {
		if (k === target) continue;
		other += Math.abs((fa.get(k) ?? 0) - (fb.get(k) ?? 0));
	}
	return dTarget / (1 + other);
}

function challengeScore(model: TasteModel, a: Work, b: Work): number {
	const ua = utilityOf(model, a);
	const ub = utilityOf(model, b);
	const low = ua.mean < ub.mean ? ua : ub;
	// most interesting challenger: predicted-unappealing but poorly understood
	return low.variance - low.mean;
}

function utilityOf(model: TasteModel, w: Work): { mean: number; variance: number } {
	const f = features(w);
	let mean = 0;
	let variance = 0;
	for (const [k, x] of f) {
		const d = model.dims.get(k);
		mean += (d?.mu ?? 0) * x;
		variance += (d?.variance ?? 1) * x * x;
	}
	return { mean, variance };
}

/** A previously answered pair, sides swapped, for consistency probing. */
function consistencyProbe(
	events: AppEvent[],
	workById: (id: string) => Work | undefined,
	h: SelectionHistory,
	rng: () => number
): SmartPair | null {
	const answered = events.filter(
		(e): e is Extract<AppEvent, { t: 'pair_choice' }> =>
			e.t === 'pair_choice' && (e.pick === 'a' || e.pick === 'b')
	);
	if (answered.length < 10) return null;
	// prefer pairs answered a while ago (first half of history)
	const pool = answered.slice(0, Math.max(1, Math.floor(answered.length / 2)));
	for (let i = 0; i < 8; i++) {
		const e = pool[Math.floor(rng() * pool.length)];
		if (!e) break;
		const a = workById(e.b); // swapped on purpose
		const b = workById(e.a);
		if (a && b) return { a, b, probe: 'within-stratum', slot: 'consistency' };
	}
	void h;
	return null;
}

export function selectPairSmart(
	works: Work[],
	h: SelectionHistory,
	model: TasteModel,
	events: AppEvent[],
	workById: (id: string) => Work | undefined,
	options: SmartOptions = {}
): SmartPair | null {
	const seed = options.seed ?? 1;
	const rng = mulberry32(seed * 7 + h.interactionIndex * 131);
	const objective = options.targetDims && options.targetDims.length > 0 ? options.targetDims : null;

	// Scheduled consistency probe every ~15 interactions.
	if (h.interactionIndex > 0 && h.interactionIndex % 15 === 14) {
		const probe = consistencyProbe(events, workById, h, rng);
		if (probe) return probe;
	}

	// Narrow objective dims need more draws to find honest contrast.
	const candidates = candidatePairs(works, h, objective ? 72 : 48, options);
	if (candidates.length === 0) {
		const fallback = selectPair(works, h, options);
		return fallback ? { ...fallback, slot: 'exploration' } : null;
	}

	// Slot windows. With an active objective the targeted slot takes ~44% of
	// turns and absorbs most of the refutation window; imported-prior dims
	// keep getting probed via the 20% share of the target draw below.
	const wExplore = objective ? 0.1 : 0.15;
	const wChallenge = objective ? 0.18 : 0.25;
	const wTargetedOrRefute = objective ? 0.62 : 0.45;

	const r = rng();
	if (r < wExplore) {
		const pick = candidates[Math.floor(rng() * candidates.length)] as SelectedPair;
		return { ...pick, slot: 'exploration' };
	}
	if (r < wChallenge) {
		let best: SelectedPair = candidates[0] as SelectedPair;
		let bestScore = -Infinity;
		for (const c of candidates) {
			const s = challengeScore(model, c.a, c.b);
			if (s > bestScore) {
				bestScore = s;
				best = c;
			}
		}
		return { ...best, slot: 'challenge' };
	}
	const provisional = provisionalDims(model);
	if (r < wTargetedOrRefute && (objective || provisional.length > 0)) {
		// Draw the target: 80% from the session objective when present, the
		// rest from provisional (imported) dims awaiting refutation.
		const fromObjective = objective && (provisional.length === 0 || rng() < 0.8);
		const source = fromObjective ? objective : provisional;
		if (source.length > 0) {
			const target = source[Math.floor(rng() * source.length)] as string;
			let best: SelectedPair | null = null;
			let bestScore = 0;
			for (const c of candidates) {
				const s = refutationScore(target, c.a, c.b);
				if (s > bestScore) {
					bestScore = s;
					best = c;
				}
			}
			// No pair honestly contrasts the target → fall through, never starve.
			if (best) return { ...best, slot: fromObjective ? 'targeted' : 'refutation' };
		}
	}
	const targetSet = objective ? new Set(objective) : undefined;
	let best: SelectedPair = candidates[0] as SelectedPair;
	let bestScore = -Infinity;
	for (const c of candidates) {
		const s = infoGain(model, c.a, c.b, targetSet);
		if (s > bestScore) {
			bestScore = s;
			best = c;
		}
	}
	return { ...best, slot: 'information' };
}
