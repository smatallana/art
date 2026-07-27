/**
 * Human-readable presentation helpers shared across the app.
 * Pure functions — unit tested in format.test.ts.
 */

/** Format a creation-date range like museums do: "1642", "c. 1660", "1503–1519". */
export function formatYearRange(
	start: number | null | undefined,
	end?: number | null,
	circa = false
): string {
	if (start == null && end == null) return 'date unknown';
	const prefix = circa ? 'c. ' : '';
	if (start != null && end != null && end !== start) {
		return `${prefix}${formatYear(start)}–${formatYear(end)}`;
	}
	const y = start ?? end;
	return `${prefix}${formatYear(y as number)}`;
}

function formatYear(y: number): string {
	return y < 0 ? `${Math.abs(y)} BCE` : String(y);
}

/** "Johannes Vermeer (1632–1675)" — tolerate missing vital dates. */
export function formatArtistLine(name: string, born?: number | null, died?: number | null): string {
	if (born == null && died == null) return name;
	const b = born != null ? formatYear(born) : '?';
	const d = died != null ? formatYear(died) : '?';
	return `${name} (${b}–${d})`;
}
