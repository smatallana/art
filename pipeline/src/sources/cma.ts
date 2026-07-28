/**
 * Cleveland Museum of Art adapter.
 * Docs: https://openaccess-api.clevelandart.org/ — CC0 dataset and CC0 images
 * for open-access works; no key, no published rate limit (we stay polite).
 * `did_you_know` / `fun_fact` provide ready-made micro-stories.
 */
import type { SourceAdapter, Work } from '../types.js';
import { fetchJson, parseYear, sleep, firstSentences, stripHtml } from '../util.js';

const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const PAGE_SIZE = 100;

interface CmaResponse {
	info: { total: number };
	data: CmaRecord[];
}

export interface CmaRecord {
	id: number;
	accession_number: string | null;
	title: string | null;
	creation_date: string | null;
	creation_date_earliest: number | null;
	creation_date_latest: number | null;
	creators: { description: string | null; role: string | null }[] | null;
	culture: string[] | null;
	technique: string | null;
	department: string | null;
	type: string | null;
	measurements: string | null;
	images: {
		web?: { url: string; width: string | number; height: string | number } | null;
		print?: { url: string; width: string | number; height: string | number } | null;
		full?: { url: string; width: string | number; height: string | number } | null;
	} | null;
	share_license_status: string | null;
	url: string | null;
	tombstone: string | null;
	did_you_know: string | null;
	fun_fact: string | null;
	wall_description: string | null;
}

async function page(skip: number, limit: number): Promise<CmaResponse> {
	const params = new URLSearchParams({
		type: 'Painting',
		cc0: '1',
		has_image: '1',
		limit: String(limit),
		skip: String(skip)
	});
	return fetchJson<CmaResponse>(`${API}?${params}`);
}

/** Parse "Claude Monet (French, 1840–1926)" into name + vitals. */
export function parseCmaCreator(description: string | null): {
	name: string;
	nationality: string | null;
	born: number | null;
	died: number | null;
	culture?: string;
} {
	if (!description) return { name: 'Unknown artist', nationality: null, born: null, died: null };
	const m = description.match(/^(.*?)\s*\((.*)\)\s*$/);
	// Real CMA artists come as "Name (Nationality, yyyy-yyyy)". A description
	// without the parenthetical is an attribution culture/region ("India",
	// "China, Ming dynasty"), not a person — keep it as culture, not artist.
	if (!m) return { name: 'Unknown artist', nationality: null, born: null, died: null, culture: description.trim() };
	const name = (m[1] as string).trim() || 'Unknown artist';
	const inner = m[2] as string;
	const years = inner.match(/(\d{4})\s*[–-]\s*(?:c\.\s*)?(\d{4})/);
	const nationality = (inner.split(',')[0] ?? '').trim();
	return {
		name,
		nationality: nationality && !/\d/.test(nationality) ? nationality : null,
		born: years ? parseInt(years[1] as string, 10) : null,
		died: years ? parseInt(years[2] as string, 10) : null
	};
}

function num(v: string | number | null | undefined): number | null {
	if (v == null) return null;
	const n = typeof v === 'number' ? v : parseInt(v, 10);
	return Number.isFinite(n) ? n : null;
}

export const cma: SourceAdapter = {
	id: 'cma',

	async fetchSample(n: number): Promise<unknown[]> {
		const res = await page(0, n);
		return res.data;
	},

	async fetchRaw(limit: number, log): Promise<unknown[]> {
		const out: unknown[] = [];
		let skip = 0;
		while (out.length < limit) {
			const res = await page(skip, Math.min(PAGE_SIZE, limit - out.length));
			out.push(...res.data);
			skip += res.data.length;
			log(`cma: ${out.length}/${Math.min(limit, res.info.total)}`);
			if (skip >= res.info.total || res.data.length === 0) break;
			await sleep(600);
		}
		return out;
	},

	normalize(raw: unknown): { work: Work } | { reject: string } {
		const r = raw as CmaRecord;
		if (r.share_license_status?.toUpperCase() !== 'CC0') return { reject: 'not-cc0' };
		if (!r.title) return { reject: 'no-title' };
		const web = r.images?.web;
		if (!web?.url) return { reject: 'no-image' };
		const w = num(web.width);
		const h = num(web.height);
		if (!w || !h) return { reject: 'no-dimensions' };
		const master = r.images?.print ?? r.images?.full ?? null;
		const masterW = num(master?.width) ?? w;
		const masterH = num(master?.height) ?? h;
		if (masterW < 700) return { reject: 'image-too-small' };
		const aspect = w / h;
		if (aspect < 0.25 || aspect > 4) return { reject: 'extreme-aspect' };

		const creator = parseCmaCreator(r.creators?.[0]?.description ?? null);
		const story = r.did_you_know ?? r.fun_fact ?? null;

		const work: Work = {
			id: `cma-${r.id}`,
			source: 'cma',
			sourceId: String(r.id),
			title: r.title,
			artist: {
				name: creator.name,
				born: creator.born,
				died: creator.died,
				nationality: creator.nationality
			},
			date: {
				start: r.creation_date_earliest ?? parseYear(r.creation_date),
				end: r.creation_date_latest ?? null,
				display: r.creation_date ?? 'date unknown'
			},
			medium: r.technique ?? null,
			dimensions: r.measurements ?? null,
			museum: {
				name: 'The Cleveland Museum of Art',
				department: r.department ?? null,
				accession: r.accession_number ?? null,
				url: r.url ?? `https://www.clevelandart.org/art/${r.accession_number ?? r.id}`
			},
			rights: {
				status: 'cc0',
				attribution: 'The Cleveland Museum of Art — CC0'
			},
			images: {
				aspect: Math.round(aspect * 1000) / 1000,
				width: masterW,
				height: masterH,
				thumb: web.url,
				display: web.url,
				full: master?.url ?? null,
				host: 'museum'
			},
			movement: null,
			culture: r.culture?.[0] ?? creator.culture ?? null,
			place: null,
			story: story ? firstSentences(story, 2, 300) : null,
			tags: {},
			quality: { score: 0, flags: [] }
		};
		return { work };
	}
};

/** Metadata fields that feed the tagger for CMA records. */
export function cmaTagFields(raw: unknown): { subjects: string[]; styles: string[]; terms: string[] } {
	const r = raw as CmaRecord;
	const text = [stripHtml(r.tombstone), stripHtml(r.wall_description)].filter(Boolean).join(' ');
	return {
		subjects: [],
		styles: r.culture ?? [],
		// CMA has no subject taxonomy in this API — the tagger falls back to
		// keyword scanning of tombstone/wall text and the title.
		terms: text ? [text] : []
	};
}
