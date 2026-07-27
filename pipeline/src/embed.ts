/**
 * Embedding stage: CLIP image embeddings for every catalog work.
 *
 * Model: Xenova/clip-vit-base-patch32 (quantized) via transformers.js —
 * the SAME weights the app loads client-side for Snap photo matching, so
 * photo and catalog vectors share one space.
 *
 * Output (app/static/catalog/):
 *   embeddings.bin        Uint8 matrix [n × 512], per-vector symmetric
 *                         int8 quantization mapped to 0..255
 *   embeddings-meta.json  { ids[], dim, scales[] } aligned with the matrix
 *
 * Politeness: AIC images fetched serially at ~1 rps (their IIIF etiquette);
 * other hosts at moderate concurrency. Isolated failures are skipped and
 * reported — a missing embedding only excludes that work from Snap matching —
 * but the stage aborts if >20% fail, so a broken fetch path can never commit
 * a mostly-empty embeddings file.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Work } from './types.js';
import { fetchBuffer, sleep } from './util.js';

const DIM = 512;

interface EmbedOptions {
	catalogDir: string;
	log: (msg: string) => void;
}

async function loadCatalog(catalogDir: string): Promise<Work[]> {
	const index = JSON.parse(await readFile(path.join(catalogDir, 'index.json'), 'utf8')) as {
		shards: { file: string }[];
	};
	const works: Work[] = [];
	for (const s of index.shards) {
		works.push(...(JSON.parse(await readFile(path.join(catalogDir, s.file), 'utf8')) as Work[]));
	}
	return works;
}

function isPoliteHost(url: string): boolean {
	try {
		return new URL(url).hostname.includes('artic.edu');
	} catch {
		return false;
	}
}

export async function runEmbedStage({ catalogDir, log }: EmbedOptions): Promise<void> {
	// Lazy import: heavy, and only this stage needs it.
	const { pipeline, RawImage } = await import('@huggingface/transformers');
	log('loading CLIP image encoder (Xenova/clip-vit-base-patch32, quantized)…');
	const extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', {
		dtype: 'q8'
	});

	const works = await loadCatalog(catalogDir);
	log(`embedding ${works.length} works…`);

	const ids: string[] = [];
	const scales: number[] = [];
	const rows: Uint8Array[] = [];
	let failed = 0;

	const embedOne = async (w: Work): Promise<void> => {
		try {
			// Fetch ourselves (pipeline UA + backoff): AIC's CDN rejects the
			// bare fetch RawImage.fromURL would issue.
			const buf = await fetchBuffer(w.images.thumb);
			const image = await RawImage.fromBlob(new Blob([buf]));
			const output = await extractor(image);
			const vec = Array.from(output.data as Float32Array).slice(0, DIM);
			// L2 normalize, then symmetric int8 quantization.
			const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
			const unit = vec.map((v) => v / norm);
			const maxAbs = Math.max(...unit.map(Math.abs)) || 1;
			const row = new Uint8Array(DIM);
			for (let i = 0; i < DIM; i++) {
				row[i] = Math.max(0, Math.min(255, Math.round(((unit[i] as number) / maxAbs) * 127 + 128)));
			}
			ids.push(w.id);
			scales.push(maxAbs);
			rows.push(row);
		} catch (e) {
			failed++;
			if (failed <= 10) log(`embed failed for ${w.id}: ${String(e).slice(0, 120)}`);
		}
	};

	const polite = works.filter((w) => isPoliteHost(w.images.thumb));
	const fast = works.filter((w) => !isPoliteHost(w.images.thumb));

	let done = 0;
	const tick = (): void => {
		done++;
		if (done % 100 === 0) log(`embed: ${done}/${works.length} (${failed} failed)`);
	};

	// Fast hosts with small concurrency (encoding is the bottleneck anyway).
	const CONCURRENCY = 3;
	let next = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			while (next < fast.length) {
				const w = fast[next++] as Work;
				await embedOne(w);
				tick();
			}
		})
	);
	// Polite hosts serially at ~1 rps.
	for (const w of polite) {
		await embedOne(w);
		tick();
		await sleep(1000);
	}

	if (failed > works.length * 0.2) {
		throw new Error(
			`embed stage failed for ${failed}/${works.length} works — aborting instead of committing a mostly-empty embeddings file`
		);
	}

	const matrix = new Uint8Array(rows.length * DIM);
	rows.forEach((r, i) => matrix.set(r, i * DIM));
	await mkdir(catalogDir, { recursive: true });
	await writeFile(path.join(catalogDir, 'embeddings.bin'), matrix);
	await writeFile(
		path.join(catalogDir, 'embeddings-meta.json'),
		JSON.stringify({
			model: 'Xenova/clip-vit-base-patch32',
			dim: DIM,
			count: ids.length,
			failed,
			generatedAt: new Date().toISOString(),
			ids,
			scales
		})
	);
	log(`embeddings written: ${ids.length} ok, ${failed} failed`);
}
