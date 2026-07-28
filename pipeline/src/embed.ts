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
 *   embeddings-meta.json  { ids[], dim, scales[], origins[] } aligned with
 *                         the matrix; origins records where each image came
 *                         from ('s' = museum source, 'c' = Wikimedia Commons)
 *
 * The stage is INCREMENTAL: existing committed embeddings are reused (and
 * pruned to the current catalog), only missing works are fetched. This
 * matters because museum CDNs sometimes block datacenter IPs (AIC's
 * Cloudflare does — see DECISIONS 2026-07-27): partial coverage can ship,
 * and a later run fills the gap without refetching anything.
 *
 * Image sources, per work:
 *   - blocked hosts (artic.edu) with a Commons mapping (data/commons-map.json)
 *     → fetched from Wikimedia Commons (same painting, different digitization
 *     — fine for Snap: museum-photo variation dominates digitization variation)
 *   - blocked hosts without a mapping → tried directly, behind a per-host
 *     circuit breaker so a refusing CDN is not hammered
 *   - everything else → fetched directly at small concurrency
 * Safety: the stage aborts rather than write zero vectors or fewer vectors
 * than are already committed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Work } from './types.js';
import { fetchBuffer, sleep } from './util.js';
import { loadCatalog } from './catalog.js';
import { commonsThumbUrl, type CommonsEntry } from './commons.js';

const DIM = 512;
const MODEL = 'Xenova/clip-vit-base-patch32';
/** Consecutive failures on a polite host before we stop hitting it this run. */
const HOST_BREAKER_LIMIT = 25;

export type Origin = 's' | 'c';

interface EmbedOptions {
	catalogDir: string;
	commonsMapFile?: string;
	log: (msg: string) => void;
}

export interface EmbeddingStore {
	ids: string[];
	scales: number[];
	rows: Uint8Array[];
	origins: Origin[];
}

/**
 * Load previously committed embeddings, or null when absent/incompatible
 * (different model or dim, or a bin/meta size mismatch). Stores written
 * before origins existed default every vector to 's'.
 */
export async function loadExistingEmbeddings(catalogDir: string): Promise<EmbeddingStore | null> {
	try {
		const meta = JSON.parse(
			await readFile(path.join(catalogDir, 'embeddings-meta.json'), 'utf8')
		) as { model?: string; dim: number; ids: string[]; scales: number[]; origins?: Origin[] };
		if (meta.model !== MODEL || meta.dim !== DIM) return null;
		if (!Array.isArray(meta.ids) || meta.ids.length !== meta.scales.length) return null;
		const bin = await readFile(path.join(catalogDir, 'embeddings.bin'));
		if (bin.length !== meta.ids.length * DIM) return null;
		const rows = meta.ids.map(
			(_, i) => new Uint8Array(bin.buffer, bin.byteOffset + i * DIM, DIM)
		);
		const origins =
			meta.origins && meta.origins.length === meta.ids.length
				? meta.origins
				: meta.ids.map((): Origin => 's');
		return { ids: meta.ids, scales: meta.scales, rows, origins };
	} catch {
		return null;
	}
}

/** Hosts that require serial ~1 rps politeness AND block datacenter GETs. */
function isBlockedHost(url: string): boolean {
	try {
		return new URL(url).hostname.includes('artic.edu');
	} catch {
		return false;
	}
}

/** Where to fetch a work's image from, and how to record its provenance. */
export function fetchTargetFor(
	work: Pick<Work, 'id'> & { images: { thumb: string } },
	commons: Record<string, CommonsEntry>
): { url: string; origin: Origin } {
	if (isBlockedHost(work.images.thumb)) {
		const m = commons[work.id];
		if (m) return { url: commonsThumbUrl(m.file), origin: 'c' };
	}
	return { url: work.images.thumb, origin: 's' };
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
			scales: store.scales,
			origins: store.origins
		})
	);
	const fromCommons = store.origins.filter((o) => o === 'c').length;
	log(
		`embeddings written: ${store.ids.length} vectors ` +
			`(${store.ids.length - fromCommons} from museum sources, ${fromCommons} from Commons; ` +
			`${failed} failed this run)`
	);
}

export async function runEmbedStage({ catalogDir, commonsMapFile, log }: EmbedOptions): Promise<void> {
	const works = await loadCatalog(catalogDir);
	const catalogIds = new Set(works.map((w) => w.id));

	let commons: Record<string, CommonsEntry> = {};
	if (commonsMapFile) {
		try {
			const parsed = JSON.parse(await readFile(commonsMapFile, 'utf8')) as {
				map?: Record<string, CommonsEntry>;
			};
			commons = parsed.map ?? {};
			log(`commons map loaded: ${Object.keys(commons).length} works`);
		} catch {
			log('no commons map found — blocked hosts will be tried directly');
		}
	}

	// Reuse committed embeddings, pruned to works still in the catalog.
	const existing = await loadExistingEmbeddings(catalogDir);
	const ids: string[] = [];
	const scales: number[] = [];
	const rows: Uint8Array[] = [];
	const origins: Origin[] = [];
	if (existing) {
		for (let i = 0; i < existing.ids.length; i++) {
			const id = existing.ids[i] as string;
			if (!catalogIds.has(id)) continue;
			ids.push(id);
			scales.push(existing.scales[i] as number);
			rows.push(existing.rows[i] as Uint8Array);
			origins.push(existing.origins[i] as Origin);
		}
	}
	const reused = ids.length;
	const done = new Set(ids);
	const todo = works.filter((w) => !done.has(w.id));
	log(`embedding ${todo.length} of ${works.length} works (${reused} reused)…`);

	if (todo.length === 0) {
		await writeStore(catalogDir, { ids, scales, rows, origins }, 0, log);
		return;
	}

	// Lazy import: heavy, and only needed when there is fetching to do.
	const { pipeline, RawImage } = await import('@huggingface/transformers');
	log(`loading CLIP image encoder (${MODEL}, quantized)…`);
	const extractor = await pipeline('image-feature-extraction', MODEL, { dtype: 'q8' });

	let failed = 0;
	const embedOne = async (w: Work): Promise<boolean> => {
		const target = fetchTargetFor(w, commons);
		try {
			// Fetch ourselves (pipeline UA + backoff): AIC's CDN rejects the
			// bare fetch RawImage.fromURL would issue. Commons thumbs get long,
			// patient retries — fresh renders are rate-limited per IP.
			const buf = await fetchBuffer(
				target.url,
				target.origin === 'c' ? { retries: 5, baseDelayMs: 2000 } : {}
			);
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
			origins.push(target.origin);
			return true;
		} catch (e) {
			failed++;
			if (failed <= 10) log(`embed failed for ${w.id}: ${String(e).slice(0, 120)}`);
			return false;
		}
	};

	// Three pools by fetch target: direct museum CDNs (small concurrency),
	// Commons (gentler concurrency + spacing), blocked hosts tried directly
	// (serial ~1 rps behind the circuit breaker).
	const direct: Work[] = [];
	const viaCommons: Work[] = [];
	const blocked: Work[] = [];
	const isWikimedia = (url: string): boolean => {
		try {
			return /(^|\.)(wikimedia|wikipedia)\.org$/.test(new URL(url).hostname);
		} catch {
			return false;
		}
	};
	for (const w of todo) {
		const t = fetchTargetFor(w, commons);
		if (t.origin === 'c' || isWikimedia(t.url)) viaCommons.push(w);
		else if (isBlockedHost(t.url)) blocked.push(w);
		else direct.push(w);
	}
	log(`pools: ${direct.length} direct, ${viaCommons.length} via Commons, ${blocked.length} blocked-host`);

	let progress = 0;
	const tick = (): void => {
		progress++;
		if (progress % 100 === 0) log(`embed: ${progress}/${todo.length} (${failed} failed)`);
	};

	const runPool = async (pool: Work[], concurrency: number, delayMs: number): Promise<void> => {
		let next = 0;
		await Promise.all(
			Array.from({ length: concurrency }, async () => {
				while (next < pool.length) {
					const w = pool[next++] as Work;
					await embedOne(w);
					tick();
					if (delayMs > 0) await sleep(delayMs);
				}
			})
		);
	};

	await runPool(direct, 3, 0);
	// Serial with generous spacing: nearly every Commons request at our width
	// is a fresh thumbnail render, which Wikimedia rate-limits per IP.
	await runPool(viaCommons, 1, 500);

	let consecutive = 0;
	let tripped = 0;
	for (const w of blocked) {
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
			`circuit breaker: blocked host refused ${HOST_BREAKER_LIMIT} in a row — ` +
				`skipped the remaining ${tripped} works this run (a later run will retry them)`
		);
	}

	if (ids.length === 0 || ids.length < reused) {
		throw new Error(
			`embed stage would write ${ids.length} vectors (previously ${reused}) — ` +
				`aborting instead of committing a regression`
		);
	}
	await writeStore(catalogDir, { ids, scales, rows, origins }, failed, log);
}
