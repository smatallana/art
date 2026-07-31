/**
 * Session intelligence: the pieces that turn recorded choices into visible
 * understanding (external review, 2026-07-29 — "the app must return value,
 * not only record answers").
 *
 * Everything here is a pure function of events + works, so every sentence
 * shown to the user is backed by testable evidence. No invented precision:
 * insights only appear above small evidence thresholds, and are phrased as
 * provisional.
 */
import type { Work } from '../catalog/types';
import type { AppEvent, PairAspect, SessionEndInsights } from './events';
import { CONTENT_PROBLEM_ASPECTS, effectiveEvents } from './events';
import { collectPairAnnotations, features, STRENGTH_OMEGA, type TasteModel } from './model';
import { pairKey } from './selector';
import type { OntologyDim } from './profile';
import { directionLabel } from './profile';
import type { SessionPair } from './session';
import { eraBucket } from './strata';

/**
 * Era buckets as first-class pattern candidates. Every dated work carries an
 * era one-hot (model.ts features), and era is the ONE dimension the whole
 * catalog has — 55% of works carry zero ontology tags, so a summary that
 * ignores era starves on real sessions (first real-user testing: five
 * sessions, five identical "not enough information" endings). Labels are
 * phrased to read in every template they reach ("works from …", "leaning
 * toward …", "where you stand on …", "Testing: …").
 */
export const ERA_DIMS: OntologyDim[] = [
	{ id: 'era.pre1500', group: 'context', kind: 'binary', label: 'the era before 1500' },
	{ id: 'era.e1500', group: 'context', kind: 'binary', label: 'the 1500s and 1600s' },
	{ id: 'era.e1700', group: 'context', kind: 'binary', label: 'the 1700s and early 1800s' },
	{ id: 'era.e1850', group: 'context', kind: 'binary', label: 'the late 1800s' },
	{ id: 'era.e1900', group: 'context', kind: 'binary', label: 'the modern era' }
];
const ERA_BY_ID = new Map(ERA_DIMS.map((d) => [d.id, d]));

/** Strength is asked only when the answer is genuinely informative. */
export function wantsStrength(slot: SessionPair['slot'], position: number): boolean {
	if (
		slot === 'information' ||
		slot === 'refutation' ||
		slot === 'consistency' ||
		slot === 'targeted'
	) {
		return true;
	}
	// Calibration: sample every third pair so early sessions stay light.
	if (slot === 'calibration') return position % 3 === 0;
	return false;
}

/**
 * A specific "why this pairing" — the dimensions the pair actually
 * contrasts, by tag difference. Returns null when the contrast is too weak
 * to say anything honest (the UI then omits the section entirely).
 */
export function explainPair(
	a: Work,
	b: Work,
	dims: OntologyDim[]
): { dimLabels: [string, string?]; eraGap: number | null } | null {
	const fa = features(a);
	const fb = features(b);
	const byId = new Map(dims.map((d) => [d.id, d]));
	const contrasts: { dim: OntologyDim; diff: number }[] = [];
	const ids = new Set([...fa.keys(), ...fb.keys()]);
	for (const id of ids) {
		if (id.startsWith('era.')) continue;
		const dim = byId.get(id);
		if (!dim) continue;
		const diff = Math.abs((fa.get(id) ?? 0) - (fb.get(id) ?? 0));
		if (diff >= 0.35) contrasts.push({ dim, diff });
	}
	contrasts.sort((x, y) => y.diff - x.diff);
	const ya = a.date.start;
	const yb = b.date.start;
	const eraGap = ya != null && yb != null && Math.abs(ya - yb) >= 150 ? Math.abs(ya - yb) : null;
	if (contrasts.length === 0 && eraGap == null) return null;
	const first = contrasts[0]?.dim.label;
	if (!first && eraGap == null) return null;
	return {
		dimLabels: first
			? [first, contrasts[1]?.dim.label]
			: [`${Math.round((eraGap as number) / 100)} centuries apart`],
		eraGap
	};
}

export interface SessionInsight {
	/** Dims with the most consistent session-local evidence, with direction. */
	patterns: { dimId: string; label: string; n: number }[];
	/** A pattern the session contradicted (chosen against), if any. */
	counter: { dimId: string; label: string } | null;
	/** Chosen works of the pairs that contributed MOST to the top pattern
	 *  (contribution-ranked, saves/remembers as tiebreak — never mere recency). */
	evidenceWorkIds: string[];
	/** The chosen work of the strongest AGAINST-pattern pair, if any. */
	counterExampleWorkId: string | null;
	/** A dimension the session touched but left genuinely unresolved. */
	openQuestion: { id: string; label: string } | null;
	/** ≥2 neither answers sharing a taste aspect — rejection is evidence too. */
	rejection: { aspect: PairAspect; n: number } | null;
	/** ≥2 both answers sharing an aspect — what the pairs had in common. */
	shared: { aspect: PairAspect; n: number } | null;
	answered: number;
	/** Concrete session facts for the no-pattern ending — computed from the
	 *  session, never a fixed line (five sessions must not end identically). */
	facts: {
		/** Distinct era buckets among the works shown (unknown excluded). */
		erasSeen: number;
		/** Most-picked era among a/b choices, when it has ≥2 picks. */
		topEra: { label: string; n: number } | null;
		savedCount: number;
	};
}

/** Aspects that describe taste (not content problems, not "don't know"). */
const TASTE_ASPECTS: ReadonlySet<PairAspect> = new Set([
	'subject',
	'color',
	'style',
	'atmosphere',
	'emotion',
	'composition',
	'technique',
	'too-decorative',
	'too-abstract',
	'too-busy',
	'flat',
	'no-pull',
	'too-similar'
]);

/**
 * What THIS session taught: net per-dimension pull from its pair choices
 * (chosen minus rejected features), weighted by the strength the user gave
 * (same multipliers as the model), with content-flagged pairs excluded.
 * Thresholded — fewer than 2 consistent signals on a dim is not a pattern.
 */
export function sessionSummary(
	sessionEvents: AppEvent[],
	workById: (id: string) => Work | undefined,
	dims: OntologyDim[]
): SessionInsight {
	const live = effectiveEvents(sessionEvents);
	const ann = collectPairAnnotations(live);
	// Era buckets sit alongside the ontology as pattern candidates — the one
	// dimension every dated work carries (see ERA_DIMS above).
	const byId = new Map([...ERA_DIMS, ...dims].map((d) => [d.id, d]));
	const pull = new Map<string, { net: number; n: number }>();
	/** Per answered a/b pair: what it pulled, for contribution ranking later. */
	const pairRecords: { chosenId: string; d: Map<string, number> }[] = [];
	const savedIds = new Set<string>();
	const aspectCounts = {
		neither: new Map<PairAspect, number>(),
		both: new Map<PairAspect, number>()
	};
	const erasSeen = new Set<string>();
	const chosenEras = new Map<string, number>();
	let neitherCount = 0;
	let bothCount = 0;
	let answered = 0;

	for (const e of live) {
		if (e.t === 'save' || e.t === 'remember') savedIds.add(e.work);
		if (e.t === 'pair_feedback') {
			// Last feedback per pair wins; simplest faithful count: recount below.
			continue;
		}
		if (e.t !== 'pair_choice') continue;
		answered++;
		if (e.pick === 'neither') neitherCount++;
		if (e.pick === 'both') bothCount++;
		const wa = workById(e.a);
		const wb = workById(e.b);
		for (const w of [wa, wb]) {
			if (!w) continue;
			const era = eraBucket(w);
			if (era !== 'unknown') erasSeen.add(era);
		}
		if (e.pick !== 'a' && e.pick !== 'b') continue;
		// A pair the user flagged as broken content teaches nothing here either.
		if (ann.contentFlagged.has(pairKey(e.a, e.b))) continue;
		const chosen = e.pick === 'a' ? wa : wb;
		const other = e.pick === 'a' ? wb : wa;
		if (!chosen || !other) continue;
		const chosenEra = eraBucket(chosen);
		if (chosenEra !== 'unknown') {
			chosenEras.set(chosenEra, (chosenEras.get(chosenEra) ?? 0) + 1);
		}
		const level = ann.strength.get(pairKey(e.a, e.b));
		const w = level ? (STRENGTH_OMEGA[level] ?? 1) : 1;
		const fc = features(chosen);
		const fo = features(other);
		const ids = new Set([...fc.keys(), ...fo.keys()]);
		const record = { chosenId: chosen.id, d: new Map<string, number>() };
		for (const id of ids) {
			const d = (fc.get(id) ?? 0) - (fo.get(id) ?? 0);
			if (Math.abs(d) < 0.2) continue;
			const cur = pull.get(id) ?? { net: 0, n: 0 };
			cur.net += d * w;
			cur.n++;
			pull.set(id, cur);
			record.d.set(id, d * w);
		}
		pairRecords.push(record);
	}

	// Aspect evidence from the LAST feedback per pair (toggles re-emit full arrays).
	const lastFeedback = new Map<string, { kind: string; aspects: PairAspect[] }>();
	for (const e of live) {
		if (e.t === 'pair_feedback') {
			lastFeedback.set(pairKey(e.a, e.b), { kind: e.kind, aspects: e.aspects });
		}
	}
	for (const fb of lastFeedback.values()) {
		const bucket =
			fb.kind === 'pushed-away'
				? aspectCounts.neither
				: fb.kind === 'shared'
					? aspectCounts.both
					: null;
		if (!bucket) continue;
		for (const a of fb.aspects) {
			if (!TASTE_ASPECTS.has(a) || CONTENT_PROBLEM_ASPECTS.has(a)) continue;
			bucket.set(a, (bucket.get(a) ?? 0) + 1);
		}
	}
	const topAspect = (m: Map<PairAspect, number>, minAnswers: number, have: number) => {
		if (have < minAnswers) return null;
		const top = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
		return top && top[1] >= 2 ? { aspect: top[0], n: top[1] } : null;
	};

	const scored = [...pull.entries()]
		.filter(([id, p]) => byId.has(id) && p.n >= 2 && Math.abs(p.net) >= 0.8)
		.map(([id, p]) => ({ dim: byId.get(id) as OntologyDim, net: p.net, n: p.n }))
		.sort((x, y) => Math.abs(y.net) - Math.abs(x.net));

	const patterns = scored
		.filter((s) => s.net > 0)
		.slice(0, 2)
		.map((s) => ({ dimId: s.dim.id, label: directionLabel(s.dim, s.net), n: s.n }));
	// Era one-hots mirror each other: choosing era X over era Y mechanically
	// pushes Y negative. When an era pattern is already claimed, its mirror is
	// not a contradiction — only genuine counter-signals surface.
	const eraPatterned = patterns.some((p) => p.dimId.startsWith('era.'));
	const negative = scored.find((s) => s.net < 0 && !(eraPatterned && s.dim.id.startsWith('era.')));
	// A dim with many observations but near-zero net pull is genuinely open.
	const open = [...pull.entries()]
		.filter(([id, p]) => byId.has(id) && p.n >= 3 && Math.abs(p.net) < 0.4)
		.sort((x, y) => y[1].n - x[1].n)[0];

	// Evidence = chosen works of the pairs that actually produced the top
	// pattern, strongest contribution first; saves break ties. A recent pick
	// that contributed nothing to the headline does not appear.
	let evidenceWorkIds: string[] = [];
	let counterExampleWorkId: string | null = null;
	const topDim = patterns[0]?.dimId;
	if (topDim) {
		const sign = Math.sign(pull.get(topDim)?.net ?? 1) || 1;
		const contributions = pairRecords
			.map((r) => ({ id: r.chosenId, c: (r.d.get(topDim) ?? 0) * sign }))
			.filter((r) => r.c !== 0);
		contributions.sort(
			(x, y) => y.c - x.c || Number(savedIds.has(y.id)) - Number(savedIds.has(x.id))
		);
		evidenceWorkIds = [...new Set(contributions.filter((r) => r.c > 0).map((r) => r.id))].slice(
			0,
			3
		);
		const worst = contributions[contributions.length - 1];
		if (worst && worst.c < -0.2) counterExampleWorkId = worst.id;
	} else {
		// No pattern: fall back to chosen works, saves first, then recency.
		const chosenIds = pairRecords.map((r) => r.chosenId).reverse();
		evidenceWorkIds = [
			...new Set([...chosenIds.filter((id) => savedIds.has(id)), ...chosenIds])
		].slice(0, 3);
	}

	return {
		patterns,
		counter: negative
			? { dimId: negative.dim.id, label: directionLabel(negative.dim, -negative.net) }
			: null,
		evidenceWorkIds,
		counterExampleWorkId,
		openQuestion: open
			? { id: open[0], label: (byId.get(open[0]) as OntologyDim).label.toLowerCase() }
			: null,
		rejection: topAspect(aspectCounts.neither, 2, neitherCount),
		shared: topAspect(aspectCounts.both, 2, bothCount),
		answered,
		facts: {
			erasSeen: erasSeen.size,
			topEra: (() => {
				const top = [...chosenEras.entries()].sort((x, y) => y[1] - x[1])[0];
				if (!top || top[1] < 2) return null;
				const label = ERA_BY_ID.get(`era.${top[0]}`)?.label;
				return label ? { label, n: top[1] } : null;
			})(),
			savedCount: savedIds.size
		}
	};
}

/**
 * Freeze a session's conclusions into the compact session_end payload.
 * `z` snapshots each pattern dim's model evidence at record time (0 when
 * the dim is absent or no model exists) so later profile views can say
 * strengthened/weakened/changed against it. Patterns are positive-net by
 * construction, hence s: 1 today — the field future-proofs direction.
 */
export function toSessionEndInsights(
	s: SessionInsight,
	model: TasteModel | null
): SessionEndInsights {
	const zOf = (dim: string): number => {
		const d = model?.dims.get(dim);
		if (!d) return 0;
		return Math.round((Math.abs(d.mu) / Math.sqrt(d.variance)) * 100) / 100;
	};
	return {
		v: 1,
		patterns: s.patterns.map((p) => ({
			dim: p.dimId,
			label: p.label,
			n: p.n,
			s: 1,
			z: zOf(p.dimId)
		})),
		...(s.counter ? { counter: { dim: s.counter.dimId, label: s.counter.label } } : {}),
		...(s.openQuestion ? { open: { dim: s.openQuestion.id, label: s.openQuestion.label } } : {}),
		...(s.rejection ? { rejection: { aspect: s.rejection.aspect, n: s.rejection.n } } : {}),
		...(s.shared ? { shared: { aspect: s.shared.aspect, n: s.shared.n } } : {}),
		facts: {
			erasSeen: s.facts.erasSeen,
			topEra: s.facts.topEra?.label ?? null,
			saved: s.facts.savedCount
		},
		answered: s.answered
	};
}

/**
 * A mid-session micro-insight: one short provisional line, only when a dim
 * already has ≥3 consistent same-direction signals this session. Null means
 * say nothing (most of the time).
 */
export function microInsight(
	sessionEvents: AppEvent[],
	workById: (id: string) => Work | undefined,
	dims: OntologyDim[]
): string | null {
	const s = sessionSummary(sessionEvents, workById, dims);
	const top = s.patterns[0];
	if (!top || top.n < 3) return null;
	return top.label;
}
