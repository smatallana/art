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
import type { AppEvent } from './events';
import { effectiveEvents } from './events';
import { features } from './model';
import type { OntologyDim } from './profile';
import { directionLabel } from './profile';
import type { SessionPair } from './session';

/** Strength is asked only when the answer is genuinely informative. */
export function wantsStrength(slot: SessionPair['slot'], position: number): boolean {
	if (slot === 'information' || slot === 'refutation' || slot === 'consistency') return true;
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
	patterns: { label: string; n: number }[];
	/** A pattern the session contradicted (chosen against), if any. */
	counter: { label: string } | null;
	/** Work ids that anchor the patterns (chosen works), most recent first. */
	evidenceWorkIds: string[];
	/** A dimension the session touched but left genuinely unresolved. */
	openQuestion: string | null;
	answered: number;
}

/**
 * What THIS session taught: net per-dimension pull from its pair choices
 * (chosen minus rejected features). Thresholded — fewer than 2 consistent
 * signals on a dim is not a pattern.
 */
export function sessionSummary(
	sessionEvents: AppEvent[],
	workById: (id: string) => Work | undefined,
	dims: OntologyDim[]
): SessionInsight {
	const byId = new Map(dims.map((d) => [d.id, d]));
	const pull = new Map<string, { net: number; n: number }>();
	const evidence: string[] = [];
	let answered = 0;

	for (const e of effectiveEvents(sessionEvents)) {
		if (e.t !== 'pair_choice') continue;
		answered++;
		if (e.pick !== 'a' && e.pick !== 'b') continue;
		const chosen = workById(e.pick === 'a' ? e.a : e.b);
		const other = workById(e.pick === 'a' ? e.b : e.a);
		if (!chosen || !other) continue;
		evidence.unshift(chosen.id);
		const fc = features(chosen);
		const fo = features(other);
		const ids = new Set([...fc.keys(), ...fo.keys()]);
		for (const id of ids) {
			if (id.startsWith('era.')) continue;
			const d = (fc.get(id) ?? 0) - (fo.get(id) ?? 0);
			if (Math.abs(d) < 0.2) continue;
			const cur = pull.get(id) ?? { net: 0, n: 0 };
			cur.net += d;
			cur.n++;
			pull.set(id, cur);
		}
	}

	const scored = [...pull.entries()]
		.filter(([id, p]) => byId.has(id) && p.n >= 2 && Math.abs(p.net) >= 0.8)
		.map(([id, p]) => ({ dim: byId.get(id) as OntologyDim, net: p.net, n: p.n }))
		.sort((x, y) => Math.abs(y.net) - Math.abs(x.net));

	const patterns = scored
		.filter((s) => s.net > 0)
		.slice(0, 2)
		.map((s) => ({ label: directionLabel(s.dim, s.net), n: s.n }));
	const negative = scored.find((s) => s.net < 0);
	// A dim with many observations but near-zero net pull is genuinely open.
	const open = [...pull.entries()]
		.filter(([id, p]) => byId.has(id) && p.n >= 3 && Math.abs(p.net) < 0.4)
		.sort((x, y) => y[1].n - x[1].n)[0];

	return {
		patterns,
		counter: negative ? { label: directionLabel(negative.dim, -negative.net) } : null,
		evidenceWorkIds: evidence.slice(0, 3),
		openQuestion: open ? (byId.get(open[0]) as OntologyDim).label.toLowerCase() : null,
		answered
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
