/**
 * Live image validation with per-host politeness.
 *
 * AIC's IIIF etiquette is ~1 request/second, single-file — probing thousands
 * of works at high concurrency gets the runner blocked (observed: every AIC
 * probe 403'd at concurrency 6). Hosts declared "polite" are probed serially
 * with a delay and SAMPLED (their IIIF service is uniform: URLs are derived
 * from image_id by one pattern, so a healthy sample validates the scheme;
 * the R2 mirroring stage later touches every file individually anyway).
 * All other hosts get a full sweep at moderate concurrency.
 */
import type { Work } from './types.js';
import { mapLimit, probeUrl, sleep } from './util.js';

const POLITE_HOSTS: { match: string; delayMs: number; sampleEvery: number }[] = [
	{ match: 'artic.edu', delayMs: 1000, sampleEvery: 8 },
	{ match: 'wikimedia.org', delayMs: 1000, sampleEvery: 6 },
	{ match: 'wikipedia.org', delayMs: 1000, sampleEvery: 6 }
];

export interface ValidationReport {
	checked: number;
	sampled: number;
	deadDisplay: string[];
	politeHosts: string[];
	survivors: number;
}

function politeRule(url: string): { delayMs: number; sampleEvery: number } | null {
	try {
		const host = new URL(url).hostname;
		for (const rule of POLITE_HOSTS) if (host.includes(rule.match)) return rule;
	} catch {
		// invalid URL → treated as dead by the probe below
	}
	return null;
}

export async function validateImages(
	works: Work[],
	{ concurrency = 6 }: { concurrency?: number } = {},
	log: (msg: string) => void = () => {}
): Promise<{ works: Work[]; report: ValidationReport }> {
	const dead = new Set<string>();
	const politeQueue: Work[] = [];
	const fastQueue: Work[] = [];
	for (const w of works) {
		(politeRule(w.images.display) ? politeQueue : fastQueue).push(w);
	}

	// Full sweep of fast hosts.
	let done = 0;
	await mapLimit(fastQueue, concurrency, async (w) => {
		if (!(await probeUrl(w.images.display))) dead.add(w.id);
		done++;
		if (done % 250 === 0) log(`probe(fast): ${done}/${fastQueue.length}`);
	});

	// Serial, delayed, sampled sweep of polite hosts.
	let sampled = 0;
	for (let i = 0; i < politeQueue.length; i++) {
		const w = politeQueue[i] as Work;
		const rule = politeRule(w.images.display) as { delayMs: number; sampleEvery: number };
		if (i % rule.sampleEvery !== 0) continue;
		sampled++;
		if (!(await probeUrl(w.images.display))) dead.add(w.id);
		if (sampled % 25 === 0) log(`probe(polite): ${sampled} sampled of ${politeQueue.length}`);
		await sleep(rule.delayMs);
	}

	const survivors = works.filter((w) => !dead.has(w.id));
	return {
		works: survivors,
		report: {
			checked: fastQueue.length + sampled,
			sampled,
			deadDisplay: [...dead],
			politeHosts: POLITE_HOSTS.map((p) => p.match),
			survivors: survivors.length
		}
	};
}
