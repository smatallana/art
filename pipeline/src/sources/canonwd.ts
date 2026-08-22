/**
 * Canon source: the curatorial spine, resolved through Wikidata + Wikimedia.
 *
 * Why: the catalog must represent painting's major artists and works, not
 * whichever museum APIs are convenient (external review, 2026-07-28). This
 * source turns `data/canon/canon.json` (artists + per-artist targets) into
 * catalog works:
 *
 *   artist name ──exact-label SPARQL (occupation painter, most-sitelinked
 *   item wins ties)──▶ QID ──paintings with images (P18), ranked by the
 *   work's own sitelink count (fame proxy → canonical anchors first)──▶
 *   top-N per artist ──Commons imageinfo (pixel dims + rendered thumb
 *   URLs)──▶ Work records (source 'wd', host 'wikimedia').
 *
 * `data/canon/manual-works.json` adds in-copyright landmarks Commons cannot
 * host: images are resolved on Wikipedia's file pages (fair-use size) and
 * LINKED, never copied; rights = 'in-copyright' with a © attribution the
 * app always shows.
 *
 * Etiquette: Wikidata SPARQL in small batches; Wikimedia API ≤ 1 req/s with
 * the pipeline User-Agent. Every unresolvable artist/work is logged, never
 * silently dropped.
 */
import { readFile } from 'node:fs/promises';
import { suspectImageFilename, wdRights } from '../rights.js';
import type { Work } from '../types.js';
import { fetchJson, mapLimit, sleep } from '../util.js';
import { tagFromMetadata } from '../tagger.js';

const SPARQL = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const ENWIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAINTING = 'Q3305213';
const PAINTER = 'Q1028181';
const ARTIST_BATCH = 12;
const IMAGEINFO_BATCH = 40;

export interface CanonArtist {
	name: string;
	target: number;
	/** Optional Wikidata QID override for names label/alias matching misses.
	 *  Verified against the item's label before use — a wrong QID is skipped
	 *  and logged, never silently ingested. */
	qid?: string;
}

export interface CanonFile {
	version: number;
	artists: CanonArtist[];
}

export interface ManualWork {
	artist: string;
	title: string;
	year: number;
	movement: string;
	file?: string;
	search?: string;
}

interface SparqlBinding {
	[k: string]: { value: string } | undefined;
}

function v(b: SparqlBinding, key: string): string | null {
	return b[key]?.value ?? null;
}

function qidOf(uri: string): string {
	return uri.split('/').pop() as string;
}

async function sparql(query: string): Promise<SparqlBinding[]> {
	const res = await fetchJson<{ results: { bindings: SparqlBinding[] } }>(
		`${SPARQL}?format=json&query=${encodeURIComponent(query)}`,
		{ headers: { accept: 'application/sparql-results+json' }, timeoutMs: 60000 }
	);
	return res.results.bindings;
}

/** Resolve canon artist names → QIDs (exact label, painter, most sitelinks). */
export async function resolveArtists(
	artists: CanonArtist[],
	log: (msg: string) => void
): Promise<
	Map<
		string,
		{
			qid: string;
			name: string;
			born: number | null;
			died: number | null;
			nationality: string | null;
		}
	>
> {
	const resolved = new Map<
		string,
		{
			qid: string;
			name: string;
			born: number | null;
			died: number | null;
			nationality: string | null;
		}
	>();
	// QID overrides first, each verified against the item's actual label.
	const overridden = artists.filter((a) => a.qid);
	if (overridden.length > 0) {
		const values = overridden.map((a) => `wd:${a.qid}`).join(' ');
		const rows = await sparql(`
			SELECT ?item ?itemLabel ?born ?died ?natLabel WHERE {
				VALUES ?item { ${values} }
				OPTIONAL { ?item wdt:P569 ?born }
				OPTIONAL { ?item wdt:P570 ?died }
				OPTIONAL { ?item wdt:P27 ?nat . ?nat rdfs:label ?natLabel FILTER(LANG(?natLabel)="en") }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
			}`);
		const byQid = new Map(rows.map((r) => [qidOf(v(r, 'item') as string), r]));
		for (const a of overridden) {
			const row = byQid.get(a.qid as string);
			const label = row ? (v(row, 'itemLabel') ?? '') : '';
			const surname = a.name.split(' ').pop() as string;
			if (!row || !label.toLowerCase().includes(surname.toLowerCase())) {
				log(`canon: QID override ${a.qid} REJECTED for "${a.name}" (label "${label}")`);
				continue;
			}
			const year = (key: string): number | null => {
				const raw = v(row, key);
				const y = raw ? parseInt(raw.slice(0, raw.startsWith('-') ? 5 : 4), 10) : NaN;
				return Number.isFinite(y) ? y : null;
			};
			resolved.set(a.name, {
				qid: a.qid as string,
				name: a.name,
				born: year('born'),
				died: year('died'),
				nationality: v(row, 'natLabel')
			});
		}
		await sleep(1000);
	}

	const toMatch = artists.filter((a) => !resolved.has(a.name));
	for (let i = 0; i < toMatch.length; i += ARTIST_BATCH) {
		const chunk = toMatch.slice(i, i + ARTIST_BATCH);
		const values = chunk.map((a) => JSON.stringify(a.name) + '@en').join(' ');
		// Labels AND aliases (canonical short names like "Tintoretto" or
		// "Pieter Bruegel the Elder" are often altLabels), and any occupation
		// that is painter or a subclass of it (portraitist, watercolorist…).
		const rows = await sparql(`
			SELECT ?name ?item ?links ?born ?died ?natLabel WHERE {
				VALUES ?name { ${values} }
				?item (rdfs:label|skos:altLabel) ?name ; wikibase:sitelinks ?links .
				?item wdt:P106 ?occ . ?occ wdt:P279* wd:${PAINTER} .
				OPTIONAL { ?item wdt:P569 ?born }
				OPTIONAL { ?item wdt:P570 ?died }
				OPTIONAL { ?item wdt:P27 ?nat . ?nat rdfs:label ?natLabel FILTER(LANG(?natLabel)="en") }
			}`);
		const best = new Map<string, { links: number; row: SparqlBinding }>();
		for (const row of rows) {
			const name = v(row, 'name') as string;
			const links = Number(v(row, 'links') ?? 0);
			const cur = best.get(name);
			if (!cur || links > cur.links) best.set(name, { links, row });
		}
		for (const a of chunk) {
			const hit = best.get(a.name);
			if (!hit) {
				log(`canon: UNRESOLVED artist "${a.name}" — skipped this run`);
				continue;
			}
			const year = (key: string): number | null => {
				const raw = v(hit.row, key);
				const y = raw ? parseInt(raw.slice(0, raw.startsWith('-') ? 5 : 4), 10) : NaN;
				return Number.isFinite(y) ? y : null;
			};
			resolved.set(a.name, {
				qid: qidOf(v(hit.row, 'item') as string),
				name: a.name,
				born: year('born'),
				died: year('died'),
				nationality: v(hit.row, 'natLabel')
			});
		}
		await sleep(1000);
	}
	log(`canon: resolved ${resolved.size}/${artists.length} artists`);
	return resolved;
}

export interface CanonWorkRow {
	qid: string;
	title: string;
	creatorQid: string;
	file: string;
	links: number;
	year: number | null;
	movement: string | null;
	collection: string | null;
}

/** All paintings with images for a batch of creators, ranked later by links. */
export async function fetchWorkRows(
	creatorQids: string[],
	log: (msg: string) => void
): Promise<CanonWorkRow[]> {
	const out: CanonWorkRow[] = [];
	for (let i = 0; i < creatorQids.length; i += ARTIST_BATCH) {
		const chunk = creatorQids.slice(i, i + ARTIST_BATCH);
		const values = chunk.map((q) => `wd:${q}`).join(' ');
		const rows = await sparql(`
			SELECT ?item ?itemLabel ?creator ?image ?links ?date ?movementLabel ?collectionLabel WHERE {
				VALUES ?creator { ${values} }
				?item wdt:P31 wd:${PAINTING} ; wdt:P170 ?creator ; wdt:P18 ?image ; wikibase:sitelinks ?links .
				OPTIONAL { ?item wdt:P571 ?date }
				OPTIONAL { ?item wdt:P135 ?movement }
				OPTIONAL { ?item wdt:P195 ?collection }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
			}`);
		for (const row of rows) {
			const file = commonsFileFromP18(v(row, 'image') ?? '');
			const title = v(row, 'itemLabel');
			if (!file || !title) continue;
			const qid = qidOf(v(row, 'item') as string);
			if (/^Q\d+$/.test(title)) continue; // unlabeled item
			// P18 sanity: reject obvious room/exhibition photos; log near-misses
			// for the human audit (filenames cannot catch a photo of the
			// painting's SUBJECT — that one only human eyes find).
			const sus = suspectImageFilename(file, title);
			if (sus === 'reject') {
				log(`canon: [rejected-image] ${qid} "${title}" — ${file}`);
				continue;
			}
			if (sus === 'suspect') log(`canon: [suspect-image] ${qid} "${title}" — ${file}`);
			const rawDate = v(row, 'date');
			const year = rawDate ? parseInt(rawDate.slice(0, rawDate.startsWith('-') ? 5 : 4), 10) : NaN;
			out.push({
				qid,
				title,
				creatorQid: qidOf(v(row, 'creator') as string),
				file,
				links: Number(v(row, 'links') ?? 0),
				year: Number.isFinite(year) ? year : null,
				movement: v(row, 'movementLabel'),
				collection: v(row, 'collectionLabel')
			});
		}
		log(
			`canon: work rows ${out.length} after ${Math.min(i + ARTIST_BATCH, creatorQids.length)}/${creatorQids.length} artists`
		);
		await sleep(1000);
	}
	return out;
}

export function commonsFileFromP18(url: string): string | null {
	try {
		const seg = new URL(url).pathname.split('/').pop();
		if (!seg) return null;
		const file = decodeURIComponent(seg);
		return /\.(jpe?g|png|tiff?)$/i.test(file) ? file : null;
	} catch {
		return null;
	}
}

/** Top-N per creator by sitelinks (fame proxy), dedup by item qid. */
export function pickTopWorks(rows: CanonWorkRow[], targets: Map<string, number>): CanonWorkRow[] {
	const byCreator = new Map<string, CanonWorkRow[]>();
	const seen = new Set<string>();
	for (const r of rows) {
		if (seen.has(r.qid)) continue;
		seen.add(r.qid);
		if (!byCreator.has(r.creatorQid)) byCreator.set(r.creatorQid, []);
		(byCreator.get(r.creatorQid) as CanonWorkRow[]).push(r);
	}
	const picked: CanonWorkRow[] = [];
	for (const [creator, list] of byCreator) {
		list.sort((a, b) => b.links - a.links || a.qid.localeCompare(b.qid));
		picked.push(...list.slice(0, targets.get(creator) ?? 6));
	}
	return picked;
}

interface ImageInfo {
	width: number;
	height: number;
	thumb: string; // ~400px rendered
	display: string; // ~1024px rendered
	full: string;
}

/** Batched imageinfo lookups (pixel dims + pre-rendered thumb URLs). */
async function imageInfoFor(
	files: string[],
	api: string,
	log: (msg: string) => void
): Promise<Map<string, ImageInfo>> {
	const out = new Map<string, ImageInfo>();
	for (let i = 0; i < files.length; i += IMAGEINFO_BATCH) {
		const chunk = files.slice(i, i + IMAGEINFO_BATCH);
		const titles = chunk.map((f) => `File:${f}`).join('|');
		try {
			const res = await fetchJson<{
				query?: {
					pages?: Record<
						string,
						{
							title: string;
							imageinfo?: { url: string; width: number; height: number; thumburl?: string }[];
						}
					>;
				};
			}>(
				`${api}?action=query&format=json&prop=imageinfo&iiprop=url|size&iiurlwidth=1024&titles=${encodeURIComponent(titles)}`
			);
			for (const page of Object.values(res.query?.pages ?? {})) {
				const info = page.imageinfo?.[0];
				if (!info || !info.width || !info.height) continue;
				const file = page.title.replace(/^File:/, '');
				const display = info.thumburl ?? info.url;
				// A second rendered size for thumbs: swap whatever px bucket
				// MediaWiki returned (it does not always honor iiurlwidth
				// exactly — rijks/met came back as /1280px-, silently missing
				// a literal '/1024px-' match and shipping display-weight thumbs).
				const thumb = /\/\d+px-/.test(display) ? display.replace(/\/\d+px-/, '/400px-') : display;
				out.set(file, { width: info.width, height: info.height, thumb, display, full: info.url });
			}
		} catch (e) {
			log(
				`canon: imageinfo batch failed (${String(e).slice(0, 80)}) — ${chunk.length} works skipped`
			);
		}
		await sleep(1000);
	}
	return out;
}

function buildWork(params: {
	id: string;
	title: string;
	artist: { name: string; born: number | null; died: number | null; nationality: string | null };
	year: number | null;
	movement: string | null;
	collection: string | null;
	info: ImageInfo;
	sourceUrl: string;
	rights: Work['rights'];
}): Work | null {
	const { info } = params;
	const aspect = info.width / info.height;
	if (aspect < 0.25 || aspect > 4) return null;
	const work: Work = {
		id: params.id,
		source: 'wd',
		sourceId: params.id.replace(/^wd-/, ''),
		title: params.title,
		artist: params.artist,
		date: {
			start: params.year,
			end: params.year,
			display: params.year ? String(params.year) : 'date unknown'
		},
		medium: null,
		dimensions: null,
		museum: {
			name: params.collection ?? 'Collection unknown',
			department: null,
			accession: null,
			url: params.sourceUrl
		},
		rights: params.rights,
		images: {
			aspect: Math.round(aspect * 1000) / 1000,
			width: info.width,
			height: info.height,
			thumb: info.thumb,
			display: info.display,
			full: info.full,
			host: 'wikimedia'
		},
		movement: params.movement,
		culture: null,
		place: null,
		story: null,
		tags: {},
		quality: { score: 0, flags: [] }
	};
	work.tags = tagFromMetadata({
		title: work.title,
		movement: work.movement,
		culture: work.culture,
		medium: work.medium,
		subjects: [],
		styles: [],
		terms: []
	});
	return work;
}

/** Resolve one manual (in-copyright) work's image on enwiki, Commons second. */
async function resolveManualFile(
	m: ManualWork,
	log: (msg: string) => void
): Promise<{ file: string; api: string } | null> {
	if (m.file) {
		for (const api of [ENWIKI_API, COMMONS_API]) {
			const info = await imageInfoFor([m.file], api, () => {});
			if (info.has(m.file)) return { file: m.file, api };
			await sleep(500);
		}
	}
	if (m.search) {
		for (const api of [ENWIKI_API, COMMONS_API]) {
			try {
				const res = await fetchJson<{ query?: { search?: { title: string }[] } }>(
					`${api}?action=query&format=json&list=search&srnamespace=6&srlimit=5&srsearch=${encodeURIComponent(m.search)}`
				);
				const hit = (res.query?.search ?? [])
					.map((s) => s.title.replace(/^File:/, ''))
					.find((f) => /\.(jpe?g|png)$/i.test(f));
				if (hit) return { file: hit, api };
			} catch {
				// try the next endpoint
			}
			await sleep(500);
		}
	}
	log(`canon: manual work UNRESOLVED — ${m.artist}, "${m.title}"`);
	return null;
}

/** The full canon fetch: curated artists via Wikidata + manual landmarks. */
export async function fetchCanonWorks(
	canonPath: string,
	manualPath: string,
	log: (msg: string) => void
): Promise<Work[]> {
	const canon = JSON.parse(await readFile(canonPath, 'utf8')) as CanonFile;
	const manual = JSON.parse(await readFile(manualPath, 'utf8')) as { works: ManualWork[] };

	const artists = await resolveArtists(canon.artists, log);
	const targets = new Map<string, number>();
	const artistByQid = new Map<string, typeof artists extends Map<string, infer V> ? V : never>();
	for (const a of canon.artists) {
		const r = artists.get(a.name);
		if (!r) continue;
		targets.set(r.qid, a.target);
		artistByQid.set(r.qid, r);
	}

	const rows = await fetchWorkRows([...targets.keys()], log);
	const picked = pickTopWorks(rows, targets);
	log(`canon: picked ${picked.length} works from ${rows.length} candidate rows`);

	const info = await imageInfoFor([...new Set(picked.map((r) => r.file))], COMMONS_API, log);
	const works: Work[] = [];
	let noInfo = 0;
	for (const r of picked) {
		const i = info.get(r.file);
		const artist = artistByQid.get(r.creatorQid);
		if (!i || !artist) {
			noInfo++;
			continue;
		}
		const w = buildWork({
			id: `wd-${r.qid}`,
			title: r.title,
			artist: {
				name: artist.name,
				born: artist.born,
				died: artist.died,
				nationality: artist.nationality
			},
			year: r.year,
			movement: r.movement,
			collection: r.collection,
			info: i,
			sourceUrl: `https://www.wikidata.org/wiki/${r.qid}`,
			rights: wdRights(artist, r.year)
		});
		if (w) works.push(w);
	}
	log(`canon: built ${works.length} Wikidata works (${noInfo} without usable image info)`);

	// Manual in-copyright landmarks: linked from Wikipedia, never copied.
	let manualOk = 0;
	for (const m of manual.works) {
		const resolvedFile = await resolveManualFile(m, log);
		await sleep(1000);
		if (!resolvedFile) continue;
		const infoMap = await imageInfoFor([resolvedFile.file], resolvedFile.api, log);
		const i = infoMap.get(resolvedFile.file);
		if (!i) continue;
		const slug = `${m.artist} ${m.title}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const w = buildWork({
			id: `wd-m-${slug}`,
			title: m.title,
			artist: { name: m.artist, born: null, died: null, nationality: null },
			year: m.year,
			movement: m.movement,
			collection: null,
			info: i,
			sourceUrl:
				resolvedFile.api === ENWIKI_API
					? `https://en.wikipedia.org/wiki/File:${resolvedFile.file.replace(/ /g, '_')}`
					: `https://commons.wikimedia.org/wiki/File:${resolvedFile.file.replace(/ /g, '_')}`,
			rights: {
				status: 'in-copyright',
				attribution: `© ${m.artist} (or estate) — image linked from Wikipedia, not redistributed`
			}
		});
		if (w) {
			works.push(w);
			manualOk++;
		}
	}
	log(`canon: manual landmarks resolved ${manualOk}/${manual.works.length}`);
	return works;
}

/** Batched, polite existence probe used by mapLimit callers elsewhere. */
export const _internal = { imageInfoFor, mapLimit };
