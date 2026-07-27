/**
 * Pair selection — calibration/coverage version (M2).
 * Goals: sweep strata broadly, never repeat pairs, cool down artists and
 * works, keep both images comfortably displayable together.
 * M3 replaces `scorePair` with information-gain scoring from the Bayesian
 * model; the constraint machinery below stays.
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import { mulberry32, shuffle, type Rng } from './random';
import { stratumOf } from './strata';

export interface SelectionHistory {
	shownCount: Map<string, number>; // work id → times shown
	lastShownIndex: Map<string, number>; // work id → interaction index
	artistLastIndex: Map<string, number>; // artist name → interaction index
	seenPairs: Set<string>; // canonical "a::b" keys
	interactionIndex: number; // total pair interactions so far
}

export function pairKey(a: string, b: string): string {
	return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** Build selection history by replaying the event log. */
export function historyFromEvents(events: AppEvent[]): SelectionHistory {
	const h: SelectionHistory = {
		shownCount: new Map(),
		lastShownIndex: new Map(),
		artistLastIndex: new Map(),
		seenPairs: new Set(),
		interactionIndex: 0
	};
	for (const e of events) {
		if (e.t === 'pair_choice') {
			h.interactionIndex++;
			for (const id of [e.a, e.b]) {
				h.shownCount.set(id, (h.shownCount.get(id) ?? 0) + 1);
				h.lastShownIndex.set(id, h.interactionIndex);
			}
			h.seenPairs.add(pairKey(e.a, e.b));
		}
	}
	return h;
}

export interface SelectorOptions {
	workCooldown: number; // interactions before a work may reappear
	artistCooldown: number; // interactions before same artist reappears
	maxShownPerWork: number;
	seed: number;
}

export const DEFAULT_SELECTOR_OPTIONS: SelectorOptions = {
	workCooldown: 30,
	artistCooldown: 8,
	maxShownPerWork: 6,
	seed: 1
};

/**
 * Cooldowns scale down for small pools: a 3,000-work catalog keeps the strict
 * configured values, a tiny dev/test pool degrades gracefully instead of
 * starving the selector.
 */
export function effectiveCooldowns(
	works: Work[],
	o: SelectorOptions
): { workCooldown: number; artistCooldown: number } {
	const artists = new Set(works.map((w) => w.artist.name)).size;
	return {
		workCooldown: Math.max(1, Math.min(o.workCooldown, Math.floor(works.length / 3))),
		artistCooldown: Math.max(1, Math.min(o.artistCooldown, Math.floor(artists / 3)))
	};
}

function eligible(
	w: Work,
	h: SelectionHistory,
	o: SelectorOptions,
	cd: { workCooldown: number; artistCooldown: number }
): boolean {
	if ((h.shownCount.get(w.id) ?? 0) >= o.maxShownPerWork) return false;
	const last = h.lastShownIndex.get(w.id);
	if (last != null && h.interactionIndex - last < cd.workCooldown) return false;
	const artistLast = h.artistLastIndex.get(w.artist.name);
	if (artistLast != null && h.interactionIndex - artistLast < cd.artistCooldown) return false;
	return true;
}

/** Group works by stratum, only eligible ones. */
function eligibleByStratum(
	works: Work[],
	h: SelectionHistory,
	o: SelectorOptions
): Map<string, Work[]> {
	const cd = effectiveCooldowns(works, o);
	const map = new Map<string, Work[]>();
	for (const w of works) {
		if (!eligible(w, h, o, cd)) continue;
		const s = stratumOf(w);
		map.set(s, [...(map.get(s) ?? []), w]);
	}
	return map;
}

/** Displayability: both works should fit side-by-side / stacked nicely. */
function aspectCompatible(a: Work, b: Work): boolean {
	const ra = a.images.aspect;
	const rb = b.images.aspect;
	return Math.max(ra, rb) / Math.min(ra, rb) < 2.6;
}

export interface SelectedPair {
	a: Work;
	b: Work;
	/** why this pair: which axis it probes (shown after answering) */
	probe: 'cross-era' | 'cross-subject' | 'within-stratum' | 'coverage';
}

/**
 * Select the next pair. Calibration alternates cross-strata contrast with
 * within-stratum contrast, weighted toward strata the user has seen least.
 */
export function selectPair(
	works: Work[],
	h: SelectionHistory,
	options: Partial<SelectorOptions> = {}
): SelectedPair | null {
	const o = { ...DEFAULT_SELECTOR_OPTIONS, ...options };
	const rng: Rng = mulberry32(o.seed + h.interactionIndex * 7919);
	const byStratum = eligibleByStratum(works, h, o);
	const strata = [...byStratum.keys()];
	if (strata.length === 0) return null;

	// Least-shown strata first: coverage pressure.
	const shownPerStratum = new Map<string, number>();
	for (const [s, list] of byStratum) {
		const total = list.reduce((acc, w) => acc + (h.shownCount.get(w.id) ?? 0), 0);
		shownPerStratum.set(s, total / list.length);
	}
	const sorted = shuffle(rng, strata).sort(
		(x, y) => (shownPerStratum.get(x) ?? 0) - (shownPerStratum.get(y) ?? 0)
	);

	const wantCross = h.interactionIndex % 3 !== 2; // 2 of 3 pairs cross strata

	const tryBuild = (s1: string, s2: string): SelectedPair | null => {
		const listA = shuffle(rng, byStratum.get(s1) ?? []);
		const listB = shuffle(rng, byStratum.get(s2) ?? []);
		for (const a of listA.slice(0, 24)) {
			for (const b of listB.slice(0, 24)) {
				if (a.id === b.id) continue;
				if (a.artist.name === b.artist.name && a.artist.name !== 'Unknown artist') continue;
				if (h.seenPairs.has(pairKey(a.id, b.id))) continue;
				if (!aspectCompatible(a, b)) continue;
				const [e1, sub1] = s1.split('|');
				const [e2, sub2] = s2.split('|');
				const probe: SelectedPair['probe'] =
					s1 === s2 ? 'within-stratum' : e1 !== e2 && sub1 === sub2 ? 'cross-era' : e1 === e2 ? 'cross-subject' : 'coverage';
				return { a, b, probe };
			}
		}
		return null;
	};

	if (wantCross && sorted.length >= 2) {
		for (let i = 0; i < sorted.length - 1; i++) {
			for (let j = i + 1; j < sorted.length; j++) {
				const pair = tryBuild(sorted[i] as string, sorted[j] as string);
				if (pair) return pair;
			}
		}
	}
	for (const s of sorted) {
		const pair = tryBuild(s, s);
		if (pair) return pair;
	}
	// Fall back: relax pair-novelty only (never violate cooldowns silently).
	const flat = shuffle(rng, [...byStratum.values()].flat());
	for (let i = 0; i < flat.length - 1; i++) {
		const a = flat[i] as Work;
		const b = flat[i + 1] as Work;
		if (a.artist.name !== b.artist.name && aspectCompatible(a, b)) {
			return { a, b, probe: 'coverage' };
		}
	}
	return null;
}

/** Update history after showing a pair (mirrors historyFromEvents increments). */
export function recordShown(h: SelectionHistory, a: Work, b: Work): void {
	h.interactionIndex++;
	for (const w of [a, b]) {
		h.shownCount.set(w.id, (h.shownCount.get(w.id) ?? 0) + 1);
		h.lastShownIndex.set(w.id, h.interactionIndex);
		h.artistLastIndex.set(w.artist.name, h.interactionIndex);
	}
	h.seenPairs.add(pairKey(a.id, b.id));
}
