/**
 * The taste model: online Bayesian logistic preference learning.
 *
 * Utility of a work:  u(x) = w · φ(x)
 *   φ(x) = confidence-weighted, centered ontology dimensions (+ era one-hots).
 *   w    = per-user weight vector with a diagonal Gaussian posterior
 *          (mean μ, variance σ²) — assumed-density filtering with a
 *          Laplace-style precision update per observation.
 *
 * Pairwise choices use a Bradley–Terry/logistic likelihood on Δφ = φa − φb;
 * weaker signals (saves, skips, reactions) are treated as low-weight
 * absolute observations against a zero baseline. The posterior mean gives
 * interpretable affinities; the posterior variance gives *evidence tiers*
 * (never fake percentages). The model is a pure function of the event log —
 * replayable, exportable, upgradeable.
 */
import type { Work } from '../catalog/types';
import { CONTENT_PROBLEM_ASPECTS, effectiveEvents, type AppEvent } from './events';
import { pairKey } from './selector';
import { eraBucket, type EraBucket } from './strata';

export const ERA_FEATURES: EraBucket[] = ['pre1500', 'e1500', 'e1700', 'e1850', 'e1900'];

export interface ModelConfig {
	priorVariance: number; // σ0² for weights
	pairWeight: number;
	saveWeight: number;
	rememberWeight: number;
	skipWeight: number;
	reactionWeight: number;
	bothNeitherWeight: number;
	minObservationsForEvidence: number;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
	priorVariance: 1.0,
	pairWeight: 1.0,
	saveWeight: 0.55,
	rememberWeight: 0.4,
	skipWeight: 0.12,
	reactionWeight: 0.3,
	bothNeitherWeight: 0.3,
	minObservationsForEvidence: 3
};

export interface DimPosterior {
	mu: number;
	variance: number;
	/** observations that moved this dim (|x_d| > 0) */
	n: number;
	/** EMA of gradient-sign agreement in [-1, 1]; low |value| with high n = conflicting evidence */
	signAgreement: number;
	provisional: boolean; // came from an imported prior and not yet confirmed
}

export interface TasteModel {
	dims: Map<string, DimPosterior>;
	/** per-user decision noise from consistency probes (1 = clean) */
	temperature: number;
	consistencyChecks: { agreements: number; total: number };
	observations: number;
}

export function createModel(cfg: ModelConfig = DEFAULT_MODEL_CONFIG): TasteModel {
	void cfg;
	return {
		dims: new Map(),
		temperature: 1,
		consistencyChecks: { agreements: 0, total: 0 },
		observations: 0
	};
}

function dim(model: TasteModel, id: string, cfg: ModelConfig): DimPosterior {
	let d = model.dims.get(id);
	if (!d) {
		d = { mu: 0, variance: cfg.priorVariance, n: 0, signAgreement: 0, provisional: false };
		model.dims.set(id, d);
	}
	return d;
}

/** Feature map: dim id → value. Centered and confidence-weighted. */
export function features(work: Work): Map<string, number> {
	const f = new Map<string, number>();
	for (const [id, tag] of Object.entries(work.tags)) {
		f.set(id, (tag.v - 0.5) * tag.c);
	}
	const era = eraBucket(work);
	if (era !== 'unknown') f.set(`era.${era}`, 0.5);
	return f;
}

function diff(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
	const out = new Map<string, number>(a);
	for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) - v);
	for (const [k, v] of out) if (v === 0) out.delete(k);
	return out;
}

function sigmoid(z: number): number {
	return 1 / (1 + Math.exp(-z));
}

/** Predicted utility mean and variance for a feature vector. */
export function utility(
	model: TasteModel,
	f: Map<string, number>,
	cfg: ModelConfig = DEFAULT_MODEL_CONFIG
): { mean: number; variance: number } {
	let mean = 0;
	let variance = 0;
	for (const [id, x] of f) {
		const d = model.dims.get(id);
		mean += (d?.mu ?? 0) * x;
		variance += (d?.variance ?? cfg.priorVariance) * x * x;
	}
	return { mean, variance };
}

/** P(prefer a over b) under the posterior mean. */
export function preferProbability(
	model: TasteModel,
	fa: Map<string, number>,
	fb: Map<string, number>
): number {
	const { mean } = utility(model, diff(fa, fb));
	return sigmoid(mean / model.temperature);
}

/**
 * One Bayesian logistic update on feature vector x with target y ∈ {0,1}
 * and observation weight ω. Diagonal Laplace/ADF:
 *   p = σ(μ·x);  g = ω(y − p)
 *   μ_d += σ²_d · g · x_d          (natural-gradient mean step)
 *   1/σ²_d += ω · p(1−p) · x_d²    (precision gain)
 */
function observe(
	model: TasteModel,
	x: Map<string, number>,
	y: 0 | 1,
	omega: number,
	cfg: ModelConfig
): void {
	if (x.size === 0 || omega <= 0) return;
	let z = 0;
	for (const [id, xd] of x) z += dim(model, id, cfg).mu * xd;
	const p = sigmoid(z / model.temperature);
	const g = omega * (y - p);
	const curvature = omega * p * (1 - p);
	for (const [id, xd] of x) {
		const d = dim(model, id, cfg);
		d.mu += d.variance * g * xd;
		const precision = 1 / d.variance + curvature * xd * xd;
		d.variance = 1 / precision;
		if (Math.abs(xd) > 1e-9) {
			d.n++;
			const gradSign = Math.sign(g * xd);
			d.signAgreement = 0.9 * d.signAgreement + 0.1 * gradSign;
			// Real evidence gradually clears the provisional flag.
			if (d.provisional && d.n >= 6) d.provisional = false;
		}
	}
	model.observations++;
}

/** Strength → weight multiplier. Shared with the session-insight engine so
 *  the model and the summary weigh intensity identically. */
export const STRENGTH_OMEGA: Record<string, number> = { slight: 0.6, clear: 1.0, strong: 1.5 };

export interface ReplayContext {
	workById: (id: string) => Work | undefined;
}

/**
 * Retroactive per-pair annotations, collected by looking ahead in the log:
 * strength (recorded after its pair_choice) and content-problem flags
 * (pair_feedback whose LAST occurrence for the pair includes image-quality /
 * hard-to-judge — so un-toggling a flag un-masks). Keys are canonical.
 */
export interface PairAnnotations {
	strength: Map<string, 'slight' | 'clear' | 'strong'>;
	contentFlagged: Set<string>;
}

export function collectPairAnnotations(events: AppEvent[]): PairAnnotations {
	const strength = new Map<string, 'slight' | 'clear' | 'strong'>();
	const contentFlagged = new Set<string>();
	for (const e of events) {
		if (e.t === 'strength') {
			strength.set(pairKey(e.a, e.b), e.level);
		} else if (e.t === 'pair_feedback') {
			// Last feedback wins: each toggle re-emits the full aspects array.
			const key = pairKey(e.a, e.b);
			if (e.aspects.some((a) => CONTENT_PROBLEM_ASPECTS.has(a))) contentFlagged.add(key);
			else contentFlagged.delete(key);
		}
	}
	return { strength, contentFlagged };
}

/** Replay the full event log into a fresh model (order matters). */
export function modelFromEvents(
	events: AppEvent[],
	ctx: ReplayContext,
	cfg: ModelConfig = DEFAULT_MODEL_CONFIG,
	base?: TasteModel
): TasteModel {
	const model = base ?? createModel(cfg);
	const live = effectiveEvents(events);
	const annotations = collectPairAnnotations(live);
	const seenPairOutcome = new Map<string, 'a' | 'b'>();

	for (const e of live) {
		applyEvent(model, e, ctx, cfg, annotations, seenPairOutcome);
	}
	return model;
}

export function applyEvent(
	model: TasteModel,
	e: AppEvent,
	ctx: ReplayContext,
	cfg: ModelConfig = DEFAULT_MODEL_CONFIG,
	annotations?: PairAnnotations,
	seenPairOutcome?: Map<string, 'a' | 'b'>
): void {
	switch (e.t) {
		case 'pair_choice': {
			const a = ctx.workById(e.a);
			const b = ctx.workById(e.b);
			if (!a || !b) return;
			const fa = features(a);
			const fb = features(b);
			if (e.pick === 'a' || e.pick === 'b') {
				const level = annotations?.strength.get(pairKey(e.a, e.b));
				const omega = cfg.pairWeight * (level ? (STRENGTH_OMEGA[level] ?? 1) : 1);
				observe(model, diff(fa, fb), e.pick === 'a' ? 1 : 0, omega, cfg);
				// consistency probes: same unordered pair answered before
				const key = pairKey(e.a, e.b);
				const winner = e.pick === 'a' ? e.a : e.b;
				const prev = seenPairOutcome?.get(key);
				if (prev != null) {
					model.consistencyChecks.total++;
					if (prev === winner) model.consistencyChecks.agreements++;
					const { total, agreements } = model.consistencyChecks;
					const agreement = total > 0 ? agreements / total : 1;
					// agreement 1 → τ 1; agreement 0.5 (random) → τ 2
					model.temperature = Math.min(2.5, Math.max(1, 2 - 2 * (agreement - 0.5)));
				}
				seenPairOutcome?.set(key, winner as 'a' | 'b');
			} else if (e.pick === 'both' || e.pick === 'neither') {
				// A pair the user flagged as broken content (bad image, impossible
				// comparison) carries no taste signal in EITHER direction.
				if (annotations?.contentFlagged.has(pairKey(e.a, e.b))) return;
				const y = e.pick === 'both' ? 1 : 0;
				observe(model, fa, y, cfg.bothNeitherWeight, cfg);
				observe(model, fb, y, cfg.bothNeitherWeight, cfg);
			}
			// 'unsure' contributes exposure but no direction.
			return;
		}
		case 'save': {
			const w = ctx.workById(e.work);
			if (w) observe(model, features(w), 1, cfg.saveWeight, cfg);
			return;
		}
		case 'remember': {
			const w = ctx.workById(e.work);
			if (w) observe(model, features(w), 1, cfg.rememberWeight, cfg);
			return;
		}
		case 'skip': {
			// Only deliberate user passes carry signal. Historic 'not-now' skips
			// were emitted automatically on image load failures — infrastructure
			// noise, never preference — so they are excluded from the fold.
			if (e.reason !== 'pass') return;
			const w = ctx.workById(e.work);
			if (w) observe(model, features(w), 0, cfg.skipWeight, cfg);
			return;
		}
		case 'rating': {
			const w = ctx.workById(e.work);
			if (!w) return;
			const y = e.value >= 4 ? 1 : e.value <= 2 ? 0 : null;
			if (y != null) observe(model, features(w), y, cfg.pairWeight * 0.8, cfg);
			return;
		}
		case 'reaction': {
			const w = ctx.workById(e.work);
			if (!w) return;
			const negative = e.emotions.length === 1 && e.emotions[0] === 'indifferent';
			if (e.emotions.length > 0) {
				observe(model, features(w), negative ? 0 : 1, cfg.reactionWeight, cfg);
			}
			return;
		}
		case 'prior_import': {
			// Low-confidence starting hypotheses: shifted means, wide variance,
			// flagged provisional. The selector schedules refutation probes for
			// these; real evidence clears the flag (see observe()).
			for (const [id, mu0] of Object.entries(e.spec.weights)) {
				const d = dim(model, id, cfg);
				d.mu = Math.max(-1, Math.min(1, mu0)) * 0.5;
				d.variance = 0.7;
				d.provisional = true;
			}
			for (const id of e.spec.uncertain) {
				const d = dim(model, id, cfg);
				d.variance = Math.max(d.variance, 1.2);
			}
			return;
		}
		default:
			return;
	}
}

/** Evidence tiers derived from the posterior — the app's honest vocabulary. */
export type EvidenceTier = 'strong' | 'moderate' | 'weak' | 'insufficient';

export function evidenceTier(
	d: DimPosterior,
	cfg: ModelConfig = DEFAULT_MODEL_CONFIG
): EvidenceTier {
	if (d.n < cfg.minObservationsForEvidence) return 'insufficient';
	const z = Math.abs(d.mu) / Math.sqrt(d.variance);
	if (z >= 2.2) return 'strong';
	if (z >= 1.4) return 'moderate';
	if (z >= 0.7) return 'weak';
	return 'insufficient';
}

/** A dim with real exposure whose evidence keeps flipping sign. */
export function isConflicted(d: DimPosterior): boolean {
	return (
		d.n >= 8 && Math.abs(d.signAgreement) < 0.25 && Math.abs(d.mu) / Math.sqrt(d.variance) < 1.4
	);
}
