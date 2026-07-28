/**
 * Art Institute of Chicago adapter.
 * Docs: https://api.artic.edu/docs/  — CC0 metadata; public-domain works flagged
 * `is_public_domain`; images via IIIF (explicitly sanctioned by AIC docs at
 * ~1 rps). Anonymous rate limit: 60 req/min → we page politely with delays.
 */
import type { SourceAdapter, Work } from '../types.js';
import { fetchJson, parseYear, sleep, stripHtml, firstSentences, isCultureNotArtist } from '../util.js';

const API = 'https://api.artic.edu/api/v1/artworks/search';
const IIIF = 'https://www.artic.edu/iiif/2';
const PAGE_SIZE = 100;

const FIELDS = [
	'id',
	'title',
	'artist_display',
	'artist_title',
	'date_start',
	'date_end',
	'date_display',
	'medium_display',
	'dimensions',
	'image_id',
	'thumbnail',
	'is_public_domain',
	'department_title',
	'main_reference_number',
	'place_of_origin',
	'style_title',
	'style_titles',
	'subject_titles',
	'classification_titles',
	'term_titles',
	'artwork_type_title',
	'description',
	'short_description',
	'credit_line'
].join(',');

interface AicSearchResponse {
	pagination: { total: number; limit: number; offset: number };
	data: AicRecord[];
}

export interface AicRecord {
	id: number;
	title: string | null;
	artist_display: string | null;
	artist_title: string | null;
	date_start: number | null;
	date_end: number | null;
	date_display: string | null;
	medium_display: string | null;
	dimensions: string | null;
	image_id: string | null;
	thumbnail: { width: number; height: number; alt_text?: string | null } | null;
	is_public_domain: boolean;
	department_title: string | null;
	main_reference_number: string | null;
	place_of_origin: string | null;
	style_title: string | null;
	style_titles: string[] | null;
	subject_titles: string[] | null;
	classification_titles: string[] | null;
	term_titles: string[] | null;
	artwork_type_title: string | null;
	description: string | null;
	short_description: string | null;
	credit_line: string | null;
}

async function searchPage(
	offset: number,
	limit: number,
	dateRange?: { gte?: number; lt?: number }
): Promise<AicSearchResponse> {
	const params = new URLSearchParams({
		'query[bool][must][0][term][is_public_domain]': 'true',
		'query[bool][must][1][term][artwork_type_title.keyword]': 'Painting',
		'query[bool][must][2][exists][field]': 'image_id',
		fields: FIELDS,
		limit: String(limit),
		from: String(offset)
	});
	if (dateRange?.gte != null) {
		params.set('query[bool][must][3][range][date_start][gte]', String(dateRange.gte));
	}
	if (dateRange?.lt != null) {
		params.set('query[bool][must][3][range][date_start][lt]', String(dateRange.lt));
	}
	return fetchJson<AicSearchResponse>(`${API}?${params}`);
}

/**
 * The AIC search API only exposes the first 1,000 results of any query, so
 * the full sweep partitions the collection by date_start ranges — each
 * bucket stays under the cap; ids are deduped across buckets.
 */
const DATE_BUCKETS: { gte?: number; lt?: number }[] = [
	{ lt: 1500 },
	{ gte: 1500, lt: 1650 },
	{ gte: 1650, lt: 1780 },
	{ gte: 1780, lt: 1850 },
	{ gte: 1850, lt: 1875 },
	{ gte: 1875, lt: 1900 },
	{ gte: 1900, lt: 1925 },
	{ gte: 1925 }
];
const SEARCH_WINDOW_CAP = 1000;

export function iiifUrl(imageId: string, width: number): string {
	return `${IIIF}/${imageId}/full/${width},/0/default.jpg`;
}

/**
 * Parse AIC artist_display vitals. Live formats observed:
 *   "Vincent van Gogh (Dutch, 1853–1890)"        — single line, parenthetical
 *   "Georges Seurat\nFrench, 1859–1891"          — two lines
 */
export function parseAicArtistDisplay(display: string | null): {
	nationality: string | null;
	born: number | null;
	died: number | null;
} {
	if (!display) return { nationality: null, born: null, died: null };
	const paren = display.match(/\(([^)]+)\)/);
	const line = paren ? (paren[1] as string) : (display.split('\n')[1] ?? display);
	const years = line.match(/(\d{4})\s*[–-]\s*(\d{4})/);
	const single = line.match(/born\s+(\d{4})/i);
	const nationality = (line.split(',')[0] ?? '').trim() || null;
	return {
		nationality: nationality && !/\d/.test(nationality) ? nationality : null,
		born: years ? parseInt(years[1] as string, 10) : single ? parseInt(single[1] as string, 10) : null,
		died: years ? parseInt(years[2] as string, 10) : null
	};
}

/** Unify unknown-artist variants; route culture strings out of the field. */
function canonicalArtistName(name: string): string {
	if (/^(artist unknown|unknown|unidentified( artist)?)$/i.test(name.trim())) return 'Unknown artist';
	if (isCultureNotArtist(name)) return 'Unknown artist';
	return name;
}

export const aic: SourceAdapter = {
	id: 'aic',

	async fetchSample(n: number): Promise<unknown[]> {
		const res = await searchPage(0, n);
		return res.data;
	},

	async fetchRaw(limit: number, log): Promise<unknown[]> {
		const seen = new Set<number>();
		const out: unknown[] = [];
		for (const bucket of DATE_BUCKETS) {
			if (out.length >= limit) break;
			let offset = 0;
			while (out.length < limit && offset < SEARCH_WINDOW_CAP) {
				let page: AicSearchResponse;
				try {
					page = await searchPage(
						offset,
						Math.min(PAGE_SIZE, limit - out.length, SEARCH_WINDOW_CAP - offset),
						bucket
					);
				} catch (e) {
					log(`aic: bucket ${JSON.stringify(bucket)} page at ${offset} failed (${e}); moving on`);
					break;
				}
				for (const r of page.data) {
					if (!seen.has(r.id)) {
						seen.add(r.id);
						out.push(r);
					}
				}
				offset += page.data.length;
				log(`aic: ${out.length} collected (bucket ${JSON.stringify(bucket)}: ${offset}/${Math.min(page.pagination.total, SEARCH_WINDOW_CAP)})`);
				if (offset >= page.pagination.total || page.data.length === 0) break;
				await sleep(1100); // stay well under 60 req/min
			}
		}
		return out;
	},

	normalize(raw: unknown): { work: Work } | { reject: string } {
		const r = raw as AicRecord;
		if (!r.image_id) return { reject: 'no-image' };
		if (!r.is_public_domain) return { reject: 'not-public-domain' };
		if (!r.title) return { reject: 'no-title' };
		const dims = r.thumbnail;
		if (!dims || !dims.width || !dims.height) return { reject: 'no-dimensions' };
		if (dims.width < 700) return { reject: 'image-too-small' };
		const aspect = dims.width / dims.height;
		if (aspect < 0.25 || aspect > 4) return { reject: 'extreme-aspect' };

		const vitals = parseAicArtistDisplay(r.artist_display);
		const desc = stripHtml(r.short_description ?? r.description);

		const work: Work = {
			id: `aic-${r.id}`,
			source: 'aic',
			sourceId: String(r.id),
			title: r.title,
			artist: {
				name: canonicalArtistName(r.artist_title ?? (r.artist_display?.split('\n')[0] || 'Unknown artist')),
				born: vitals.born,
				died: vitals.died,
				nationality: vitals.nationality
			},
			date: {
				start: r.date_start ?? parseYear(r.date_display),
				end: r.date_end ?? null,
				display: r.date_display ?? 'date unknown'
			},
			medium: r.medium_display ?? null,
			dimensions: r.dimensions ?? null,
			museum: {
				name: 'Art Institute of Chicago',
				department: r.department_title ?? null,
				accession: r.main_reference_number ?? null,
				url: `https://www.artic.edu/artworks/${r.id}`
			},
			rights: {
				status: 'cc0',
				attribution: 'Art Institute of Chicago — CC0 Public Domain Designation'
			},
			images: {
				aspect: Math.round(aspect * 1000) / 1000,
				width: dims.width,
				height: dims.height,
				thumb: iiifUrl(r.image_id, 400),
				display: iiifUrl(r.image_id, 843),
				full: dims.width >= 1686 ? iiifUrl(r.image_id, 1686) : null,
				host: 'museum'
			},
			movement: r.style_title ?? null,
			culture: null,
			place: r.place_of_origin ?? null,
			story: desc ? firstSentences(desc) : null,
			tags: {},
			quality: { score: 0, flags: [] }
		};
		return { work };
	}
};

/** Extra metadata AIC exposes that feeds the tagger. */
export function aicTagFields(raw: unknown): {
	subjects: string[];
	styles: string[];
	terms: string[];
} {
	const r = raw as AicRecord;
	return {
		subjects: r.subject_titles ?? [],
		styles: [...(r.style_titles ?? []), ...(r.classification_titles ?? [])],
		terms: r.term_titles ?? []
	};
}
