/**
 * Onboarding curation — early calibration should show works a newcomer can
 * actually judge (external review round 2). During calibration the selector
 * draws from a curated pool: decent resolution, displayable aspect, no
 * specialist formats (album leaves, handscrolls, folding screens) whose
 * framing confounds a first taste read. The full catalog returns after
 * calibration — this is sequencing, not censorship.
 */
import type { Work } from '../catalog/types';

// "scroll" matches inside compounds too (handscroll, hanging scroll).
const SPECIALIST_MEDIUM =
	/\b(manuscript|folio|album|leaf|leaves|fan|textile|fragment|thangka|screen)\b|scroll/;
const MIN_WIDTH = 800;
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 2.5;
const MIN_QUALITY = 0.5;
/** Below this pool size curation would starve the selector — pass through. */
const MIN_CURATED_POOL = 40;

export function onboardingEligible(w: Work): boolean {
	if (w.images.width > 0 && w.images.width < MIN_WIDTH) return false;
	if (w.images.aspect < MIN_ASPECT || w.images.aspect > MAX_ASPECT) return false;
	if (w.quality.score < MIN_QUALITY) return false;
	if (SPECIALIST_MEDIUM.test((w.medium ?? '').toLowerCase())) return false;
	return true;
}

/** Curated pool with a size floor: tiny pools pass through unfiltered. */
export function curatePool(works: Work[]): Work[] {
	const kept = works.filter(onboardingEligible);
	return kept.length >= MIN_CURATED_POOL ? kept : works;
}

/** Shape of the editorial onboarding collection (see engine/onboarding.ts). */
export interface CuratedOnboarding {
	version: number;
	works: { id: string; stage: 1 | 2 | 3; role: 'anchor' | 'discovery' | 'contrast' }[];
}

/** After this many lifetime answers the explicit curated list hands over to
 *  the heuristic filter (and at 40 to the full pool — daily mode). */
export const CURATED_ANSWER_GATE = 24;

/**
 * The pool for the user's FIRST sessions: an explicit editorial collection,
 * staged so the earliest answers see the most legible works. Widening
 * cascade at every step — stage slice → whole collection → heuristic filter
 * → full pool — so a missing or thinned-out list can never starve a session.
 */
export function onboardingPool(
	works: Work[],
	totalAnswers: number,
	curated?: CuratedOnboarding | null
): Work[] {
	if (totalAnswers >= CURATED_ANSWER_GATE || !curated || curated.works.length === 0) {
		return curatePool(works);
	}
	const maxStage = totalAnswers < 8 ? 1 : totalAnswers < 16 ? 2 : 3;
	const byId = new Map(works.map((w) => [w.id, w]));
	const slice: Work[] = [];
	const whole: Work[] = [];
	for (const entry of curated.works) {
		const w = byId.get(entry.id);
		if (!w) continue; // catalog moved on — validation catches it in CI
		whole.push(w);
		if (entry.stage <= maxStage) slice.push(w);
	}
	if (slice.length >= MIN_CURATED_POOL) return slice;
	if (whole.length >= MIN_CURATED_POOL) return whole;
	return curatePool(works);
}

/** Curated works marked as anchors — the recovery pivot draws from these. */
export function anchorPool(works: Work[], curated?: CuratedOnboarding | null): Work[] {
	if (!curated) return [];
	const anchorIds = new Set(curated.works.filter((e) => e.role === 'anchor').map((e) => e.id));
	return works.filter((w) => anchorIds.has(w.id));
}
