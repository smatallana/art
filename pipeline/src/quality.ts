/**
 * Composite quality scoring + duplicate detection.
 * Duplicates across museums may be legitimate versions/copies of the same
 * composition — they are FLAGGED, never silently dropped. Within a source,
 * identical sourceIds are true dupes and are removed.
 */
import type { Work } from './types.js';

export function scoreQuality(work: Work): Work {
	const flags: string[] = [];
	let score = 0.5;

	if (work.images.width >= 1600) score += 0.15;
	else if (work.images.width < 900) {
		score -= 0.1;
		flags.push('low-res');
	}
	if (work.artist.name === 'Unknown artist') {
		score -= 0.05;
		flags.push('unknown-artist');
	}
	if (work.date.start == null) {
		score -= 0.05;
		flags.push('no-date');
	}
	if (work.story) score += 0.1;
	if (Object.keys(work.tags).length >= 3) score += 0.1;
	if (/^untitled/i.test(work.title)) flags.push('untitled');

	return {
		...work,
		quality: {
			score: Math.max(0, Math.min(1, score)),
			// Set-dedupe: --merge rebuilds re-score already-scored works, and
			// plain concatenation duplicated flags on every pass (1,978 works
			// carried e.g. 'low-res' three times).
			flags: [...new Set([...work.quality.flags, ...flags])]
		}
	};
}

function dupeKey(w: Work): string {
	const artist = w.artist.name.toLowerCase().replace(/[^a-z]/g, '');
	const title = w.title
		.toLowerCase()
		.replace(/\(.*?\)/g, '')
		.replace(/[^a-z0-9]/g, '')
		.slice(0, 60);
	return `${artist}::${title}`;
}

/** Remove same-source id dupes; flag cross-source artist+title collisions. */
export function dedupe(works: Work[]): { works: Work[]; removed: number; flagged: number } {
	const byId = new Map<string, Work>();
	for (const w of works) byId.set(w.id, w); // last write wins for identical ids
	const removed = works.length - byId.size;

	const byKey = new Map<string, Work[]>();
	for (const w of byId.values()) {
		const k = dupeKey(w);
		byKey.set(k, [...(byKey.get(k) ?? []), w]);
	}
	let flagged = 0;
	let wdRemoved = 0;
	for (const group of byKey.values()) {
		if (group.length > 1 && (group[0] as Work).artist.name !== 'Unknown artist') {
			// A Wikidata record duplicating a museum record is the SAME painting
			// seen through two sources — drop the wd one (museum data is richer).
			const museum = group.filter((w) => w.source !== 'wd');
			if (museum.length > 0) {
				for (const w of group) {
					if (w.source === 'wd') {
						byId.delete(w.id);
						wdRemoved++;
					}
				}
			}
			const remaining = group.filter((w) => byId.has(w.id));
			if (remaining.length > 1) {
				for (const w of remaining) {
					w.quality.flags.push('possible-duplicate');
					flagged++;
				}
			}
		}
	}
	return { works: [...byId.values()], removed: removed + wdRemoved, flagged };
}
