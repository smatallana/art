/**
 * Catalog loading, rebuilt around one promise: the app must become usable
 * in seconds, from any state, and never silently degrade.
 *
 * Strategy:
 * 1. Cached works (IndexedDB) serve instantly for returning users.
 * 2. Otherwise the precached `bootstrap.json` (~80 curated works) makes the
 *    app usable immediately (`partial`) while the full catalog streams in.
 * 3. `index.json` is fetched with timeout+retry; if its generation matches
 *    the cache, no shard is re-downloaded at all.
 * 4. Shards stream with bounded concurrency, per-shard timeout and retry,
 *    committed incrementally (first run) or swapped wholesale (refresh) so
 *    two catalog generations are never mixed.
 * 5. Failures are explicit: `degraded` (usable, incomplete, retryable) or
 *    `error` (nothing usable) — never a silent fallback catalog.
 */
import { base } from '$app/paths';
import * as idb from '../db';
import type { CatalogIndex, Work } from './types';

/** Minimum pool for a meaningful session (selector handles small pools). */
export const MIN_SESSION_POOL = 24;

const INDEX_TIMEOUT_MS = 10000;
const SHARD_TIMEOUT_MS = 15000;
const BOOTSTRAP_TIMEOUT_MS = 6000;
const SHARD_CONCURRENCY = 4;
const SHARD_RETRIES = 2;

export interface CatalogState {
	status: 'idle' | 'loading' | 'partial' | 'ready' | 'degraded' | 'error';
	works: Work[];
	byId: Map<string, Work>;
	index: CatalogIndex | null;
	fromCache: boolean;
	loadedShards: number;
	totalShards: number;
	failedShards: number;
	error: string | null;
}

/** Enough works to interact with — the bar for showing the primary action. */
export function catalogUsable(state: CatalogState): boolean {
	return state.works.length >= MIN_SESSION_POOL;
}

export interface CatalogDeps {
	fetchJson<T>(path: string, timeoutMs: number): Promise<T>;
	cachedWorks(): Promise<Work[]>;
	cacheWorks(works: Work[]): Promise<void>;
	clearWorksCache(): Promise<void>;
	kvGet<T>(key: string): Promise<T | undefined>;
	kvSet(key: string, value: unknown): Promise<void>;
}

async function realFetchJson<T>(path: string, timeoutMs: number): Promise<T> {
	const res = await fetch(path, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
	return res.json() as Promise<T>;
}

const defaultDeps: CatalogDeps = {
	fetchJson: realFetchJson,
	cachedWorks: () => idb.cachedWorks(),
	cacheWorks: (w) => idb.cacheWorks(w),
	clearWorksCache: () => idb.clearWorksCache(),
	kvGet: (k) => idb.kvGet(k),
	kvSet: (k, v) => idb.kvSet(k, v)
};

async function fetchJsonRetry<T>(
	deps: CatalogDeps,
	path: string,
	timeoutMs: number,
	retries: number
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await deps.fetchJson<T>(path, timeoutMs);
		} catch (e) {
			lastError = e;
			if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
		}
	}
	throw lastError;
}

let inFlight: Promise<CatalogState> | null = null;

/** Re-run the whole load (used by the Retry affordance). */
export function retryCatalog(
	onUpdate: (state: CatalogState) => void,
	deps: CatalogDeps = defaultDeps
): Promise<CatalogState> {
	inFlight = null;
	return loadCatalog(onUpdate, deps);
}

export function loadCatalog(
	onUpdate: (state: CatalogState) => void,
	deps: CatalogDeps = defaultDeps
): Promise<CatalogState> {
	inFlight ??= doLoad(onUpdate, deps).catch((e) => {
		// Defensive: doLoad handles its own errors; this keeps a crash visible.
		const state: CatalogState = {
			status: 'error',
			works: [],
			byId: new Map(),
			index: null,
			fromCache: false,
			loadedShards: 0,
			totalShards: 0,
			failedShards: 0,
			error: e instanceof Error ? e.message : String(e)
		};
		onUpdate(state);
		return state;
	});
	return inFlight;
}

async function doLoad(
	onUpdate: (state: CatalogState) => void,
	deps: CatalogDeps
): Promise<CatalogState> {
	const state: CatalogState = {
		status: 'loading',
		works: [],
		byId: new Map(),
		index: null,
		fromCache: false,
		loadedShards: 0,
		totalShards: 0,
		failedShards: 0,
		error: null
	};
	const emit = (): void => onUpdate({ ...state, works: state.works, byId: state.byId });
	const commit = (works: Work[]): void => {
		for (const w of works) state.byId.set(w.id, w);
		state.works = [...state.byId.values()];
	};
	emit();

	// 1. Returning users: cached catalog serves instantly.
	try {
		const cached = await deps.cachedWorks();
		if (cached.length > 0) {
			commit(cached);
			state.index = ((await deps.kvGet('catalog-index')) as CatalogIndex | undefined) ?? null;
			state.status = 'ready';
			state.fromCache = true;
			emit();
		}
	} catch {
		// cache unavailable — continue
	}

	// 2. First run: the precached bootstrap makes the app usable now.
	if (state.works.length === 0) {
		try {
			const boot = await deps.fetchJson<Work[]>(
				`${base}/catalog/bootstrap.json`,
				BOOTSTRAP_TIMEOUT_MS
			);
			commit(boot);
			state.status = 'partial';
			emit();
		} catch {
			// no bootstrap — full catalog is the only path
		}
	}

	// 3. Index, with timeout and retry.
	let index: CatalogIndex;
	try {
		index = await fetchJsonRetry<CatalogIndex>(
			deps,
			`${base}/catalog/index.json`,
			INDEX_TIMEOUT_MS,
			1
		);
	} catch (e) {
		state.error = e instanceof Error ? e.message : String(e);
		if (state.fromCache) {
			// Offline with a full cached catalog: fine.
			state.status = 'ready';
		} else if (state.works.length > 0) {
			// Bootstrap only: usable but explicitly incomplete.
			state.status = 'degraded';
		} else {
			state.status = 'error';
		}
		emit();
		return state;
	}
	state.totalShards = index.shards.length;

	// 4. Same generation already cached → nothing to download.
	const prev = (await deps.kvGet('catalog-index').catch(() => undefined)) as
		CatalogIndex | undefined;
	if (
		state.fromCache &&
		prev &&
		prev.generatedAt === index.generatedAt &&
		state.works.length >= index.count
	) {
		state.index = index;
		state.status = 'ready';
		state.loadedShards = index.shards.length;
		emit();
		return state;
	}

	// 5. Stream shards. When a full cached generation is already on screen,
	// buffer the new one and swap only if complete (never mix generations);
	// otherwise commit incrementally so the pool grows while loading.
	const replaceMode = state.fromCache;
	const buffer = new Map<string, Work>();
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(SHARD_CONCURRENCY, index.shards.length) }, async () => {
			while (next < index.shards.length) {
				const shard = index.shards[next++] as { file: string };
				try {
					const works = await fetchJsonRetry<Work[]>(
						deps,
						`${base}/catalog/${shard.file}`,
						SHARD_TIMEOUT_MS,
						SHARD_RETRIES
					);
					state.loadedShards++;
					if (replaceMode) {
						for (const w of works) buffer.set(w.id, w);
					} else {
						commit(works);
						if (state.status !== 'ready') state.status = 'partial';
					}
				} catch {
					state.failedShards++;
				}
				emit();
			}
		})
	);

	const complete = state.failedShards === 0;
	if (replaceMode) {
		if (complete) {
			state.byId = buffer;
			state.works = [...buffer.values()];
			state.fromCache = false;
		} else {
			// Keep the intact old generation; note the failed refresh.
			state.error = `catalog refresh incomplete (${state.failedShards} shards failed)`;
			state.status = 'ready';
			emit();
			return state;
		}
	}

	state.index = index;
	if (complete) {
		state.status = 'ready';
		state.error = null;
		emit();
		// Persist the new generation (clear first when it changed).
		try {
			if (!prev || prev.generatedAt !== index.generatedAt) await deps.clearWorksCache();
			await deps.cacheWorks(state.works);
			await deps.kvSet('catalog-index', index);
		} catch {
			// persistence is best-effort
		}
	} else {
		state.status = 'degraded';
		state.error = `${state.failedShards} of ${state.totalShards} catalog sections failed to load`;
		emit();
	}
	return state;
}
