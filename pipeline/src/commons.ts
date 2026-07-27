/**
 * Commons mapping stage: map AIC works to Wikimedia Commons files.
 *
 * Why: AIC's CDN serves a Cloudflare challenge to datacenter IPs, so the
 * embed stage cannot fetch their images from Actions (see DECISIONS
 * 2026-07-27). AIC's open-access works are CC0 and mirrored on Commons,
 * whose APIs sanction scripted access (descriptive User-Agent, gentle rate).
 *
 * Identity is guaranteed by an exact join, not similarity:
 *   Wikidata P4610 ("Art Institute of Chicago artwork ID") holds the same
 *   numeric id our `aic-<id>` works carry → item's P18 is the Commons file.
 * Fallback for works without a Wikidata item: Commons fulltext search for
 * the canonical source URL (insource:"artic.edu/artworks/<id>").
 *
 * Output: data/commons-map.json — { id → { file, method } }, committed for
 * reproducibility; the embed stage uses it to fetch AIC images from Commons.
 */
import { writeFile } from 'node:fs/promises';
import { fetchBuffer, fetchJson, sleep } from './util.js';
import { loadCatalog } from './catalog.js';

export interface CommonsEntry {
	file: string;
	method: 'wikidata' | 'insource';
}

export interface CommonsMapFile {
	generatedAt: string;
	counts: { aicWorks: number; wikidata: number; insource: number; unmatched: number };
	map: Record<string, CommonsEntry>;
}

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// P4610 = AIC artwork id (numeric part of our `aic-<id>`); P18 = image.
const SPARQL_QUERY = 'SELECT ?aicId ?image WHERE { ?item wdt:P4610 ?aicId ; wdt:P18 ?image . }';

const IMAGE_EXT = /\.(jpe?g|png|tiff?)$/i;

export interface SparqlBinding {
	aicId: { value: string };
	image: { value: string };
}

/** "http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20Bar.jpg" → "Foo Bar.jpg" */
export function commonsFileFromImageUrl(url: string): string | null {
	try {
		const seg = new URL(url).pathname.split('/').pop();
		if (!seg) return null;
		const file = decodeURIComponent(seg);
		return IMAGE_EXT.test(file) ? file : null;
	} catch {
		return null;
	}
}

/** Stable thumb URL for a Commons file (redirects to upload.wikimedia.org). */
export function commonsThumbUrl(file: string, width = 400): string {
	return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** Join SPARQL rows against our catalog ids; first file per work wins. */
export function matchSparqlRows(
	catalogAicIds: Set<string>,
	bindings: SparqlBinding[]
): Record<string, CommonsEntry> {
	const map: Record<string, CommonsEntry> = {};
	for (const b of bindings) {
		const id = `aic-${b.aicId.value}`;
		if (!catalogAicIds.has(id) || map[id]) continue;
		const file = commonsFileFromImageUrl(b.image.value);
		if (file) map[id] = { file, method: 'wikidata' };
	}
	return map;
}

/** First usable image file from Commons search titles ("File:…"). */
export function pickSearchFile(titles: string[]): string | null {
	for (const t of titles) {
		const file = t.replace(/^File:/, '');
		if (IMAGE_EXT.test(file)) return file;
	}
	return null;
}

interface CommonsMapOptions {
	catalogDir: string;
	outFile: string;
	log: (msg: string) => void;
}

export async function runCommonsMapStage({ catalogDir, outFile, log }: CommonsMapOptions): Promise<void> {
	const works = await loadCatalog(catalogDir);
	const aicIds = new Set(works.map((w) => w.id).filter((id) => id.startsWith('aic-')));
	log(`commons-map: ${aicIds.size} AIC works to map`);

	log('querying Wikidata (P4610 + P18)…');
	const sparql = await fetchJson<{ results: { bindings: SparqlBinding[] } }>(
		`${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(SPARQL_QUERY)}`,
		{ headers: { accept: 'application/sparql-results+json' }, timeoutMs: 60000 }
	);
	const map = matchSparqlRows(aicIds, sparql.results.bindings);
	const wikidataCount = Object.keys(map).length;
	log(`wikidata join: ${wikidataCount}/${aicIds.size} matched (${sparql.results.bindings.length} rows scanned)`);

	// Fallback: Commons fulltext search for the source URL, politely serial.
	const unmatched = [...aicIds].filter((id) => !map[id]).sort();
	let insourceCount = 0;
	let searched = 0;
	for (const id of unmatched) {
		const num = id.slice('aic-'.length);
		try {
			const res = await fetchJson<{ query?: { search?: { title: string }[] } }>(
				`${COMMONS_API}?action=query&list=search&srnamespace=6&srlimit=5&format=json` +
					`&srsearch=${encodeURIComponent(`insource:"artic.edu/artworks/${num}"`)}`
			);
			const file = pickSearchFile((res.query?.search ?? []).map((s) => s.title));
			if (file) {
				map[id] = { file, method: 'insource' };
				insourceCount++;
			}
		} catch (e) {
			if (searched < 5) log(`insource search failed for ${id}: ${String(e).slice(0, 100)}`);
		}
		searched++;
		if (searched % 100 === 0) log(`insource: ${searched}/${unmatched.length} searched, ${insourceCount} found`);
		await sleep(1000);
	}

	// Spot-check that the thumb path actually serves bytes from this runner.
	const sample = Object.values(map)[0];
	if (sample) {
		try {
			const buf = await fetchBuffer(commonsThumbUrl(sample.file));
			log(`thumb spot-check OK: ${sample.file} → ${buf.length} bytes`);
		} catch (e) {
			log(`thumb spot-check FAILED for ${sample.file}: ${String(e).slice(0, 120)}`);
		}
	}

	const unmatchedFinal = [...aicIds].filter((id) => !map[id]).length;
	const sorted: Record<string, CommonsEntry> = {};
	for (const id of Object.keys(map).sort()) sorted[id] = map[id] as CommonsEntry;
	const out: CommonsMapFile = {
		generatedAt: new Date().toISOString(),
		counts: {
			aicWorks: aicIds.size,
			wikidata: wikidataCount,
			insource: insourceCount,
			unmatched: unmatchedFinal
		},
		map: sorted
	};
	await writeFile(outFile, JSON.stringify(out, null, '\t') + '\n');
	log(
		`commons-map written: ${wikidataCount} via wikidata + ${insourceCount} via insource, ` +
			`${unmatchedFinal} unmatched → ${outFile}`
	);
}
