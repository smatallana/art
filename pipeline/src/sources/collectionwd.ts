/**
 * Collection-join source (tramo 7): paintings HELD BY a museum, resolved via
 * Wikidata (P195 collection + P18 image) and imaged from Wikimedia Commons.
 * The proven canon machinery generalized per institution — real pixel
 * dimensions via imageinfo, polite fetching, sitelinks-ranked so the
 * best-known works surface first. Each institution gets its own source tag
 * so coverage reporting and the per-session source cap see it distinctly.
 *
 * The Met's own API was probed viable (net-probe, 2026-07-29) but exposes no
 * pixel dimensions, which validation/curation/layout require — a native
 * adapter with its own image host stays in BACKLOG as an upgrade.
 */
import { tagFromMetadata } from '../tagger.js';
import type { Work } from '../types.js';
import { suspectImageFilename, wdRights } from '../rights.js';
import { fetchJson, isCultureNotArtist, sleep } from '../util.js';
import { commonsFileFromP18, _internal } from './canonwd.js';

const SPARQL_API = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const PAINTING = 'Q3305213';
const PAGE = 1000;
const MIN_WIDTH = 700;

export interface CollectionSourceConfig {
	source: 'rijks' | 'met';
	collectionQid: string;
	museumName: string;
	attribution: string;
	limit: number;
}

export const RIJKS_CONFIG: Omit<CollectionSourceConfig, 'limit'> = {
	source: 'rijks',
	collectionQid: 'Q190804',
	museumName: 'Rijksmuseum, Amsterdam',
	attribution: 'Rijksmuseum — public domain, image via Wikimedia Commons'
};

export const MET_CONFIG: Omit<CollectionSourceConfig, 'limit'> = {
	source: 'met',
	collectionQid: 'Q160236',
	museumName: 'The Metropolitan Museum of Art, New York',
	attribution: 'The Metropolitan Museum of Art — public domain, image via Wikimedia Commons'
};

interface SparqlBinding {
	[k: string]: { value: string } | undefined;
}

async function sparql(query: string): Promise<SparqlBinding[]> {
	const res = await fetchJson<{ results?: { bindings?: SparqlBinding[] } }>(
		`${SPARQL_API}?format=json&query=${encodeURIComponent(query)}`,
		{ headers: { accept: 'application/sparql-results+json' } }
	);
	return res.results?.bindings ?? [];
}

const v = (row: SparqlBinding, key: string): string | null => row[key]?.value ?? null;
const qidOf = (uri: string): string => uri.split('/').pop() as string;

export interface CollectionRow {
	qid: string;
	title: string;
	artist: string;
	file: string;
	links: number;
	year: number | null;
	movement: string | null;
}

/** Pure row parsing: dedup by qid, drop unlabeled items and culture-names. */
export function parseCollectionRows(
	bindings: SparqlBinding[],
	seen: Set<string> = new Set()
): CollectionRow[] {
	const out: CollectionRow[] = [];
	for (const row of bindings) {
		const item = v(row, 'item');
		if (!item) continue;
		const qid = qidOf(item);
		if (seen.has(qid)) continue;
		seen.add(qid);
		const file = commonsFileFromP18(v(row, 'image') ?? '');
		const title = v(row, 'itemLabel');
		if (!file || !title || /^Q\d+$/.test(title)) continue;
		if (suspectImageFilename(file, title) === 'reject') continue;
		const creator = v(row, 'creatorLabel');
		// Unlabeled creators surface as bare QIDs OR as raw blank-node URIs
		// (…/.well-known/genid/…) — 566 works rendered a URL as artist name.
		const artist =
			!creator ||
			/^Q\d+$/.test(creator) ||
			/^https?:\/\//.test(creator) ||
			isCultureNotArtist(creator)
				? 'Unknown artist'
				: creator;
		const rawDate = v(row, 'date');
		const year = rawDate ? parseInt(rawDate.slice(0, rawDate.startsWith('-') ? 5 : 4), 10) : NaN;
		out.push({
			qid,
			title,
			artist,
			file,
			links: Number(v(row, 'links') ?? 0),
			year: Number.isFinite(year) ? year : null,
			movement: v(row, 'movementLabel')
		});
	}
	return out;
}

/** Sitelinks-ranked pages of the collection's paintings with Commons images. */
export async function fetchCollectionRows(
	collectionQid: string,
	maxRows: number,
	log: (msg: string) => void
): Promise<CollectionRow[]> {
	const out: CollectionRow[] = [];
	const seen = new Set<string>();
	for (let offset = 0; out.length < maxRows && offset < maxRows * 2; offset += PAGE) {
		const rows = await sparql(`
			SELECT ?item ?itemLabel ?creatorLabel ?image ?links ?date ?movementLabel WHERE {
				?item wdt:P31 wd:${PAINTING} ; wdt:P195 wd:${collectionQid} ; wdt:P18 ?image ;
					wikibase:sitelinks ?links .
				OPTIONAL { ?item wdt:P170 ?creator }
				OPTIONAL { ?item wdt:P571 ?date }
				OPTIONAL { ?item wdt:P135 ?movement }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
			} ORDER BY DESC(?links) ?item LIMIT ${PAGE} OFFSET ${offset}`);
		if (rows.length === 0) break;
		out.push(...parseCollectionRows(rows, seen));
		log(`collection ${collectionQid}: ${out.length} rows after offset ${offset}`);
		await sleep(1000);
	}
	return out.slice(0, maxRows);
}

/**
 * Fetch a collection's works as catalog records. `excludeQids` prevents
 * double-listing paintings the canon (wd-Q…) or a prior run already carries.
 */
export async function fetchCollectionWorks(
	cfg: CollectionSourceConfig,
	excludeQids: ReadonlySet<string>,
	log: (msg: string) => void
): Promise<Work[]> {
	// Overfetch: imageinfo filtering (small files, odd aspects) thins the list.
	const rows = (
		await fetchCollectionRows(cfg.collectionQid, Math.ceil(cfg.limit * 1.6), log)
	).filter((r) => !excludeQids.has(r.qid));
	log(`${cfg.source}: ${rows.length} candidate rows after exclusions`);

	const info = await _internal.imageInfoFor(
		rows.map((r) => r.file),
		COMMONS_API,
		log
	);

	const works: Work[] = [];
	for (const r of rows) {
		if (works.length >= cfg.limit) break;
		const i = info.get(r.file);
		if (!i || i.width < MIN_WIDTH) continue;
		const aspect = i.width / i.height;
		if (aspect < 0.25 || aspect > 4) continue;
		const work: Work = {
			id: `${cfg.source}-${r.qid}`,
			source: cfg.source,
			sourceId: r.qid,
			title: r.title,
			artist: { name: r.artist, born: null, died: null, nationality: null },
			date: {
				start: r.year,
				end: r.year,
				display: r.year ? String(r.year) : 'date unknown'
			},
			medium: null,
			dimensions: null,
			museum: {
				name: cfg.museumName,
				department: null,
				accession: null,
				url: `https://www.wikidata.org/wiki/${r.qid}`
			},
			// Death year is not in the collection query; the conservative rule
			// falls back to the work date (< 1930 → PD, else linked-only ©).
			// PD works keep the museum-specific attribution line.
			rights: ((rr) =>
				rr.status === 'public-domain' ? { ...rr, attribution: cfg.attribution } : rr)(
				wdRights({ name: r.artist, died: null }, r.year)
			),
			images: {
				aspect: Math.round(aspect * 1000) / 1000,
				width: i.width,
				height: i.height,
				thumb: i.thumb,
				display: i.display,
				full: i.full,
				host: 'wikimedia'
			},
			movement: r.movement,
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
		works.push(work);
	}
	log(`${cfg.source}: built ${works.length} works (limit ${cfg.limit})`);
	return works;
}
