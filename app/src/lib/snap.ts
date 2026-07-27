/**
 * Snap: match a photo of a real-world painting against the catalog.
 *
 * The pipeline embeds every catalog work with Xenova/clip-vit-base-patch32;
 * this module lazily loads the SAME model in the browser (quantized, cached
 * by the browser after first download), embeds the photo, and ranks catalog
 * works by cosine similarity. Matching is probabilistic — the UI always asks
 * the user to confirm and never invents a match.
 */
import { base } from '$app/paths';

export interface CatalogEmbeddings {
	ids: string[];
	dim: number;
	/** dequantized unit vectors, row-major */
	vectors: Float32Array;
}

export interface SnapMatch {
	workId: string;
	similarity: number; // cosine in [-1, 1]
}

let embeddingsPromise: Promise<CatalogEmbeddings | null> | null = null;

export function loadCatalogEmbeddings(): Promise<CatalogEmbeddings | null> {
	embeddingsPromise ??= (async () => {
		try {
			const metaRes = await fetch(`${base}/catalog/embeddings-meta.json`);
			if (!metaRes.ok) return null;
			const meta = (await metaRes.json()) as {
				ids: string[];
				dim: number;
				scales: number[];
			};
			const binRes = await fetch(`${base}/catalog/embeddings.bin`);
			if (!binRes.ok) return null;
			const bytes = new Uint8Array(await binRes.arrayBuffer());
			const { ids, dim, scales } = meta;
			const vectors = new Float32Array(ids.length * dim);
			for (let r = 0; r < ids.length; r++) {
				const scale = (scales[r] ?? 1) / 127;
				for (let c = 0; c < dim; c++) {
					vectors[r * dim + c] = ((bytes[r * dim + c] as number) - 128) * scale;
				}
			}
			return { ids, dim, vectors };
		} catch {
			return null;
		}
	})();
	return embeddingsPromise;
}

type Extractor = (image: unknown) => Promise<{ data: Float32Array }>;
let extractorPromise: Promise<{
	extractor: Extractor;
	RawImage: { fromBlob: (b: Blob) => Promise<unknown> };
}> | null = null;

function loadModel(onProgress?: (msg: string) => void) {
	extractorPromise ??= (async () => {
		const { pipeline, RawImage } = await import('@huggingface/transformers');
		onProgress?.('downloading model');
		const extractor = (await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', {
			dtype: 'q8'
		})) as unknown as Extractor;
		return { extractor, RawImage: RawImage as never };
	})();
	return extractorPromise;
}

export async function embedPhoto(
	blob: Blob,
	onProgress?: (msg: string) => void
): Promise<Float32Array> {
	const { extractor, RawImage } = await loadModel(onProgress);
	onProgress?.('reading photo');
	const image = await RawImage.fromBlob(blob);
	onProgress?.('encoding');
	const output = await extractor(image);
	const vec = Float32Array.from(output.data.slice(0, 512));
	let norm = 0;
	for (const v of vec) norm += v * v;
	norm = Math.sqrt(norm) || 1;
	for (let i = 0; i < vec.length; i++) (vec as Float32Array)[i] = (vec[i] as number) / norm;
	return vec;
}

export function topMatches(photo: Float32Array, catalog: CatalogEmbeddings, k = 3): SnapMatch[] {
	const { ids, dim, vectors } = catalog;
	const scored: SnapMatch[] = [];
	for (let r = 0; r < ids.length; r++) {
		let dot = 0;
		const off = r * dim;
		for (let c = 0; c < dim; c++) dot += (photo[c] as number) * (vectors[off + c] as number);
		scored.push({ workId: ids[r] as string, similarity: dot });
	}
	scored.sort((a, b) => b.similarity - a.similarity);
	return scored.slice(0, k);
}

/** Below this cosine the UI treats candidates as "probably not in the catalog". */
export const CONFIDENT_MATCH = 0.82;
export const PLAUSIBLE_MATCH = 0.6;
