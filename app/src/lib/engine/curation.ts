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
