/**
 * Progress-toward-value: the REAL thresholds where the product unlocks
 * something, surfaced to the user (real-user finding: "how many rounds does
 * one need to play to learn anything? shouldn't that be transparent?").
 * Single source of truth — the gates in Discover and the profile import
 * these instead of hardcoding their own numbers.
 */
import { CALIBRATION_TARGET } from './session';

export { CALIBRATION_TARGET };

/** Personal recommendations (Discover) unlock after this many answers. */
export const RECS_UNLOCK = 5;
/** The profile's first portrait line appears after this many answers. */
export const PORTRAIT_UNLOCK = 8;

export interface Milestone {
	at: number;
	kind: 'recs' | 'portrait' | 'calibrated';
}

/** The next unlock ahead of a user with this many answers; null when done. */
export function nextMilestone(totalChoices: number): Milestone | null {
	if (totalChoices < RECS_UNLOCK) return { at: RECS_UNLOCK, kind: 'recs' };
	if (totalChoices < PORTRAIT_UNLOCK) return { at: PORTRAIT_UNLOCK, kind: 'portrait' };
	if (totalChoices < CALIBRATION_TARGET) return { at: CALIBRATION_TARGET, kind: 'calibrated' };
	return null;
}
