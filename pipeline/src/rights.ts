/**
 * Rights + image-sanity rules for Wikidata-sourced works.
 *
 * Rights: Wikidata records used to be hardcoded public-domain, which labeled
 * a 1978 Miró and an 1896 Picasso (d. 1973) as PD. Conservative rule
 * (70 years post mortem auctoris, with margin): public domain only when the
 * artist died before 1956, or — when the death year is unknown — the work
 * is dated before 1930. Everything else is in-copyright and its image is
 * LINKED, never copied (owner decision, tramo 5).
 *
 * Image sanity: a P18 that is really a photo of a room, an exhibition or a
 * museum wall. Filename patterns catch the obvious cases (hard reject);
 * near-misses are only logged — and a filename that matches the TITLE can
 * still be a photo of the subject, not the painting (the Picasso "Montes de
 * Málaga" case), so heuristics complement the human audit, never replace it.
 */
import type { Work } from './types.js';

export const PD_DEATH_BEFORE = 1956;
export const PD_YEAR_BEFORE = 1930;

export function wdRights(
	artist: { name: string; died: number | null },
	year: number | null
): Work['rights'] {
	const pd =
		(artist.died != null && artist.died < PD_DEATH_BEFORE) ||
		(artist.died == null && year != null && year < PD_YEAR_BEFORE);
	if (pd) {
		return { status: 'public-domain', attribution: 'Public domain — image via Wikimedia Commons' };
	}
	return {
		status: 'in-copyright',
		attribution: `© ${artist.name} (or estate) — image linked from Wikimedia Commons, not redistributed`
	};
}

// Hard list: markers that essentially never appear in a painting-reproduction
// filename. Deliberately narrow — 'interior'/'zaal' name real genre paintings
// (De Hooch's Interior with Figures), so those go to the soft list instead.
const HARD_REJECT =
	/(^|[_ ])(exhibition|installation|museum[_ ]?(room|view)|gallery[_ ]?view)([_ ]|\.|\d|,)|salle[_ ]\d/i;
const SOFT_SUSPECT = /(^|[_ ])(interior|salle|zaal|room|view|palau|palace|hall)([_ ]|\.|\d|,)/i;

const words = (s: string): Set<string> =>
	new Set((s.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? []).values());

/**
 * 'reject' → do not ingest this image; 'suspect' → ingest but log for the
 * human audit; null → no signal.
 */
export function suspectImageFilename(file: string, title: string): 'reject' | 'suspect' | null {
	const f = decodeURIComponent(file);
	if (HARD_REJECT.test(f)) return 'reject';
	if (SOFT_SUSPECT.test(f)) {
		const overlap = [...words(title)].some((w) => f.toLowerCase().includes(w));
		if (!overlap) return 'suspect';
	}
	return null;
}
