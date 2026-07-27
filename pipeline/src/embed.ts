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
 * The stage is INCREMENTAL: existing committed embeddings are reused (and
 * pruned to the current catalog), only missing works are fetched. This
 * matters because museum CDNs sometimes block datacenter IPs for a while
 * (AIC's Cloudflare has done so): partial coverage can ship — a missing
 * embedding only excludes that work from Snap matching — and a later run
 * fills the gap without refetching anything.
 *
 * Politeness: AIC images fetched serially at ~1 rps (their IIIF etiquette);
 * other hosts at moderate concurrency. A per-host circuit breaker stops
 * hammering a host that persistently refuses (e.g. a CDN-level block).
 * Safety: the stage aborts rather than write a file with zero vectors or
 * fewer vectors than are already committed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Work } from './types.js';
import { fetchBuffer, sleep } from './util.js';

const DIM = 512;
const MODEL = 'Xenova/clip-vit-base-patch32';
/** Consecutive failures on a polite host before we stop hitting it this run. */
const HOST_BREAKER_LIMIT = 25;

interface EmbedOptions {
	catalogDir: string;
	log: (msg: string) => void;
}

export interface EmbeddingStore {
	ids: string[];
	scales: number[];
	rows: Uint8Array[];
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

/**
 * Load previously committed embeddings, or null when absent/incompatible
 * (different model or dim, or a bin/meta size mismatch).
 */
export async function loadExistingEmbeddings(catalogDir: string): Promise<EmbeddingStore | null> {
	try {
		const meta = JSON.parse(
			await readFile(path.join(catalogDir, 'embeddings-meta.json'), 'utf8')
		) as { model?: string; dim: number; ids: string[]; scales: number[] };
		if (meta.model !== MODEL || meta.dim !== DIM) return null;
		if (!Array.isArray(meta.ids) || meta.ids.length !== meta.scales.length) return null;
		const bin = await readFile(path.join(catalogDir, 'embeddings.bin'));
		if (bin.length !== meta.ids.length * DIM) return null;
		const rows = meta.ids.map(
			(_, i) => new Uint8Array(bin.buffer, bin.byteOffset + i * DIM, DIM)
		);
		return { ids: meta.ids, scales: meta.scales, rows };
	} catch {
		return null;
	}
}

function isPoliteHost(url: string): boolean {
	try {
		return new URL(url).hostname.includes('artic.edu');
	} catch {
		return false;
	}
}

async function writeStore(
	catalogDir: string,
	store: EmbeddingStore,
	failed: number,
	log: (msg: string) => void
): Promise<void> {
	const matrix = new Uint8Array(store.ids.length * DIM);
	store.rows.forEach((r, i) => matrix.set(r, i * DIM));
	await mkdir(catalogDir, { recursive: true });
	await writeFile(path.join(catalogDir, 'embeddings.bin'), matrix);
	await writeFile(
		path.join(catalogDir, 'embeddings-meta.json'),
		JSON.stringify({
			model: MODEL,
			dim: DIM,
			count: store.ids.length,
			failed,
			generatedAt: new Date().toISOString(),
			ids: store.ids,
			scales: store.scales
		})
	);
	log(`embeddings written: ${store.ids.length} vectors (${failed} failed this run)`);
}

export async function runEmbedStage({ catalogDir, log }: EmbedOptions): Promise<void> {
	const works = await loadCatalog(catalogDir);
	const catalogIds = new Set(works.map((w) => w.id));

	// Reuse committed embeddings, pruned to works still in the catalog.
	const existing = await loadExistingEmbeddings(catalogDir);
	const ids: string[] = [];
	const scales: number[] = [];
	const rows: Uint8Array[] = [];
	if (existing) {
		for (let i = 0; i < existing.ids.length; i++) {
			const id = existing.ids[i] as string;
			if (!catalogIds.has(id)) continue;
			ids.push(id);
			scales.push(existing.scales[i] as number);
			rows.push(existing.rows[i] as Uint8Array);
		}
	}
	const reused = ids.length;
	const done = new Set(ids);
	const todo = works.filter((w) => !done.has(w.id));
	log(`embedding ${todo.length} of ${works.length} works (${reused} reused)…`);

	if (todo.length === 0) {
		await writeStore(catalogDir, { ids, scales, rows }, 0, log);
		return;
	}

	// Lazy import: heavy, and only needed when there is fetching to do.
	const { pipeline, RawImage } = await import('@huggingface/transformers');
	log(`loading CLIP image encoder (${MODEL}, quantized)…`);
	const extractor = await pipeline('image-feature-extraction', MODEL, { dtype: 'q8' });

	let failed = 0;
	const embedOne = async (w: Work): Promise<boolean> => {
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
			return true;
		} catch (e) {
			failed++;
			if (failed <= 10) log(`embed failed for ${w.id}: ${String(e).slice(0, 120)}`);
			return false;
		}
	};

	const polite = todo.filter((w) => isPoliteHost(w.images.thumb));
	const fast = todo.filter((w) => !isPoliteHost(w.images.thumb));

	let progress = 0;
	const tick = (): void => {
		progress++;
		if (progress % 100 === 0) log(`embed: ${progress}/${todo.length} (${failed} failed)`);
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
	// Polite hosts serially at ~1 rps, with a circuit breaker: if the host
	// refuses HOST_BREAKER_LIMIT works in a row (CDN-level block), stop
	// hitting it — the incremental next run will pick these up.
	let consecutive = 0;
	let tripped = 0;
	for (const w of polite) {
		if (consecutive >= HOST_BREAKER_LIMIT) {
			failed++;
			tripped++;
			continue;
		}
		consecutive = (await embedOne(w)) ? 0 : consecutive + 1;
		tick();
		await sleep(1000);
	}
	if (tripped > 0) {
		log(
			`circuit breaker: polite host refused ${HOST_BREAKER_LIMIT} in a row — ` +
				`skipped the remaining ${tripped} works this run (a later run will retry them)`
		);
	}

	if (ids.length === 0 || ids.length < reused) {
		throw new Error(
			`embed stage would write ${ids.length} vectors (previously ${reused}) — ` +
				`aborting instead of committing a regression`
		);
	}
	await writeStore(catalogDir, { ids, scales, rows }, failed, log);
}
