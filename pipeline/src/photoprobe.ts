/**
 * photo-probe: catalog-wide sweep for records whose "image" is not a painting
 * reproduction — a photograph of a room, a landscape, a building, an
 * exhibition. Motivated by two real cases human eyes caught: Miró's "Dona"
 * (a photo of the Palau del Parlament) and Picasso's "Mountains of Málaga"
 * (a photo of the actual mountains, whose FILENAME matches the title, so no
 * filename heuristic can find it).
 *
 * Method: the committed image embeddings (embeddings.bin, CLIP ViT-B/32)
 * scored against photo-vs-painting text prompts — no image refetch, same
 * pattern as tag-clip. OUTPUT IS A REPORT ONLY: suspects ranked by margin,
 * for the human audit. Drops happen exclusively via overrides.json after
 * confirmation. Runs in Actions (needs the HF text encoder download).
 */
import { writeFile } from 'node:fs/promises';
import { loadCatalog } from './catalog.js';
import { loadExistingEmbeddings } from './embed.js';
import { centroid, dequantizeRow, dot } from './tagclip.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
const DIM = 512;

export const PHOTO_PROMPTS = [
	'a photograph of a room interior',
	'a photograph of a building',
	'a photograph of a mountain landscape',
	'a photograph of a museum gallery with people',
	'an exhibition installation photograph',
	'a color snapshot photograph'
];
export const PAINTING_PROMPTS = [
	'a painting',
	'an oil painting',
	'a reproduction of a painting',
	'a work of art on canvas'
];

export interface PhotoSuspect {
	id: string;
	title: string;
	artist: string;
	source: string;
	margin: number; // photo score − painting score (higher = more photo-like)
	image: string;
}

export async function runPhotoProbe(opts: {
	catalogDir: string;
	reportFile: string;
	top: number;
	log: (m: string) => void;
}): Promise<void> {
	const { catalogDir, reportFile, top, log } = opts;
	const works = await loadCatalog(catalogDir);
	const store = await loadExistingEmbeddings(catalogDir);
	if (!store) throw new Error('no committed embeddings found — run the embed stage first');

	const { AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers');
	log(`loading CLIP text encoder (${MODEL}, quantized)…`);
	const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
	const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
	const texts = [...PHOTO_PROMPTS, ...PAINTING_PROMPTS];
	const inputs = tokenizer(texts, { padding: true, truncation: true });
	const out = (await model(inputs)) as { text_embeds: { data: Float32Array; dims: number[] } };
	const unit = (i: number): Float32Array => {
		const raw = out.text_embeds.data.slice(i * DIM, (i + 1) * DIM);
		let norm = 0;
		for (let j = 0; j < DIM; j++) norm += (raw[j] as number) ** 2;
		norm = Math.sqrt(norm) || 1;
		const v = new Float32Array(DIM);
		for (let j = 0; j < DIM; j++) v[j] = (raw[j] as number) / norm;
		return v;
	};
	const photo = centroid(PHOTO_PROMPTS.map((_, i) => unit(i)));
	const painting = centroid(PAINTING_PROMPTS.map((_, i) => unit(PHOTO_PROMPTS.length + i)));

	const byId = new Map(works.map((w) => [w.id, w]));
	const suspects: PhotoSuspect[] = [];
	for (let i = 0; i < store.ids.length; i++) {
		const id = store.ids[i] as string;
		const w = byId.get(id);
		if (!w) continue;
		const vec = dequantizeRow(store.rows[i] as Uint8Array, store.scales[i] as number);
		const margin = dot(vec, photo) - dot(vec, painting);
		if (margin > 0) {
			suspects.push({
				id,
				title: w.title,
				artist: w.artist.name,
				source: w.source,
				margin: Math.round(margin * 1000) / 1000,
				image: w.images.display
			});
		}
	}
	suspects.sort((a, b) => b.margin - a.margin);
	const report = {
		generatedAt: new Date().toISOString(),
		note: 'Works whose embedding reads more photograph than painting — RANKED SUSPECTS for the human audit, not verdicts. Drops only via data/curated/overrides.json after human confirmation.',
		scanned: store.ids.length,
		flagged: suspects.length,
		suspects: suspects.slice(0, top)
	};
	await writeFile(reportFile, JSON.stringify(report, null, 1));
	log(
		`photo-probe: ${suspects.length}/${store.ids.length} lean photo; top ${Math.min(top, suspects.length)} written to ${reportFile}`
	);
}
