/**
 * Live validation: probe image URLs, drop works whose display image is dead,
 * and report everything. Run in CI (the dev sandbox blocks museum domains).
 */
import type { Work } from './types.js';
import { mapLimit, probeUrl } from './util.js';

export interface ValidationReport {
	checked: number;
	deadDisplay: string[];
	deadThumb: string[];
	survivors: number;
}

export async function validateImages(
	works: Work[],
	{ concurrency = 6, thumbSampleEvery = 10 }: { concurrency?: number; thumbSampleEvery?: number } = {},
	log: (msg: string) => void = () => {}
): Promise<{ works: Work[]; report: ValidationReport }> {
	const deadDisplay: string[] = [];
	const deadThumb: string[] = [];
	let done = 0;

	const results = await mapLimit(works, concurrency, async (w, i) => {
		const displayOk = await probeUrl(w.images.display);
		if (!displayOk) deadDisplay.push(w.id);
		// Thumbs share infrastructure with display URLs; sample them.
		if (displayOk && i % thumbSampleEvery === 0 && w.images.thumb !== w.images.display) {
			const thumbOk = await probeUrl(w.images.thumb);
			if (!thumbOk) deadThumb.push(w.id);
		}
		done++;
		if (done % 200 === 0) log(`probe: ${done}/${works.length}`);
		return displayOk;
	});

	const survivors = works.filter((_, i) => results[i]);
	return {
		works: survivors,
		report: {
			checked: works.length,
			deadDisplay,
			deadThumb,
			survivors: survivors.length
		}
	};
}
