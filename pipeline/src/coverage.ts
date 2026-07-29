/**
 * Coverage & concentration governance: the catalog is part of the model, so
 * its composition is measured on every build — and, since tramo 7, DIFFED
 * against the curatorial spine so absences are visible, not just shares.
 * The committed data/coverage.json makes gaps reviewable in the repo.
 */
import type { Work } from './types.js';

export interface CanonFile {
	artists: { name: string; target: number; qid?: string }[];
}

export interface ManualWorksFile {
	works: { artist: string; title: string }[];
}

export interface CoverageReport {
	generatedAt: string | null;
	totalWorks: number;
	bySource: Record<string, number>;
	byCentury: Record<string, number>;
	byMovement: Record<string, number>;
	byCulture: Record<string, number>;
	topArtists: [string, number][];
	canon: {
		targetTotal: number;
		actualTotal: number;
		/** Canon artists with zero works in the catalog. */
		absent: string[];
		/** Worst deficits first; met/exceeded targets are omitted for signal. */
		underTarget: { name: string; target: number; actual: number; deficit: number }[];
	} | null;
	/** manual-works entries with no matching catalog work (artist+title). */
	unresolvedManualWorks: string[];
	warnings: string[];
}

export function coverageReport(
	works: Work[],
	canon: CanonFile | null,
	manual: ManualWorksFile | null,
	log: (msg: string) => void,
	generatedAt: string | null = null
): CoverageReport {
	const share = (n: number): number => Math.round((1000 * n) / Math.max(1, works.length)) / 10;
	const bySourceCount: Record<string, number> = {};
	const byCenturyCount: Record<string, number> = {};
	const byMovementCount: Record<string, number> = {};
	const byCultureCount: Record<string, number> = {};
	const byArtist: Record<string, number> = {};
	for (const w of works) {
		bySourceCount[w.source] = (bySourceCount[w.source] ?? 0) + 1;
		const y = w.date.start;
		const c = y == null ? 'unknown' : `${Math.floor((y - 1) / 100) + 1}c`;
		byCenturyCount[c] = (byCenturyCount[c] ?? 0) + 1;
		if (w.movement) byMovementCount[w.movement] = (byMovementCount[w.movement] ?? 0) + 1;
		if (w.culture) byCultureCount[w.culture] = (byCultureCount[w.culture] ?? 0) + 1;
		byArtist[w.artist.name] = (byArtist[w.artist.name] ?? 0) + 1;
	}
	const toShares = (counts: Record<string, number>, top = 0): Record<string, number> => {
		let entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
		if (top > 0) entries = entries.slice(0, top);
		return Object.fromEntries(entries.map(([k, n]) => [k, share(n)]));
	};
	const bySource = toShares(bySourceCount);
	const byCentury = Object.fromEntries(
		Object.entries(byCenturyCount)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([k, n]) => [k, share(n)])
	);
	const topArtists = Object.entries(byArtist)
		.filter(([name]) => name !== 'Unknown artist')
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15) as [string, number][];

	let canonSection: CoverageReport['canon'] = null;
	if (canon) {
		const absent: string[] = [];
		const underTarget: { name: string; target: number; actual: number; deficit: number }[] = [];
		let actualTotal = 0;
		for (const a of canon.artists) {
			const actual = byArtist[a.name] ?? 0;
			actualTotal += actual;
			if (actual === 0) absent.push(a.name);
			else if (actual < a.target) {
				underTarget.push({ name: a.name, target: a.target, actual, deficit: a.target - actual });
			}
		}
		underTarget.sort((x, y) => y.deficit - x.deficit);
		canonSection = {
			targetTotal: canon.artists.reduce((s, a) => s + a.target, 0),
			actualTotal,
			absent,
			underTarget
		};
	}

	const unresolvedManualWorks: string[] = [];
	if (manual) {
		const titles = new Set(works.map((w) => `${w.artist.name}::${w.title}`.toLowerCase()));
		for (const m of manual.works) {
			if (!titles.has(`${m.artist}::${m.title}`.toLowerCase())) {
				unresolvedManualWorks.push(`${m.artist} — ${m.title}`);
			}
		}
	}

	const warnings: string[] = [];
	for (const [src, pct] of Object.entries(bySource)) {
		if (pct > 35) warnings.push(`source concentration: ${src} is ${pct}% of the catalog (>35%)`);
	}
	if (canonSection && canonSection.absent.length > 0) {
		warnings.push(`canon: ${canonSection.absent.length} spine artists have ZERO works`);
	}

	log(`coverage: sources ${JSON.stringify(bySource)}`);
	log(`coverage: centuries ${JSON.stringify(byCentury)}`);
	if (canonSection) {
		log(
			`coverage: canon ${canonSection.actualTotal}/${canonSection.targetTotal} works, ` +
				`${canonSection.absent.length} artists absent, ${canonSection.underTarget.length} under target`
		);
	}
	if (unresolvedManualWorks.length > 0) {
		log(`coverage: ${unresolvedManualWorks.length} manual landmark(s) unresolved`);
	}
	for (const wmsg of warnings) log(`coverage WARNING: ${wmsg}`);

	return {
		generatedAt,
		totalWorks: works.length,
		bySource,
		byCentury,
		byMovement: toShares(byMovementCount, 20),
		byCulture: toShares(byCultureCount, 20),
		topArtists,
		canon: canonSection,
		unresolvedManualWorks,
		warnings
	};
}
