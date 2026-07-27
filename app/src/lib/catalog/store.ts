/**
 * Catalog loading: index + shards from the deployed site (or the committed
 * dev fixture when no real catalog is present), cached in IndexedDB so the
 * app works offline and starts instantly on revisit.
 */
import { base } from '$app/paths';
import { cacheWorks, cachedWorks, kvGet, kvSet } from '../db';
import type { CatalogIndex, Work } from './types';

export interface CatalogState {
	status: 'idle' | 'loading' | 'ready' | 'error';
	works: Work[];
	byId: Map<string, Work>;
	index: CatalogIndex | null;
	fromCache: boolean;
	error: string | null;
}

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(path, { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
	return res.json() as Promise<T>;
}

async function loadFromNetwork(root: string): Promise<{ index: CatalogIndex; works: Work[] }> {
	const index = await fetchJson<CatalogIndex>(`${root}/index.json`);
	const shards = await Promise.all(index.shards.map((s) => fetchJson<Work[]>(`${root}/${s.file}`)));
	return { index, works: shards.flat() };
}

/**
 * Load the catalog. Strategy:
 * 1. Serve cached works immediately if present (offline-first).
 * 2. Refresh from network in the background; real catalog preferred,
 *    dev fixture as fallback so the app always has something to show.
 */
export async function loadCatalog(onUpdate: (state: CatalogState) => void): Promise<CatalogState> {
	const state: CatalogState = {
		status: 'loading',
		works: [],
		byId: new Map(),
		index: null,
		fromCache: false,
		error: null
	};
	onUpdate(state);

	// 1. Instant start from cache.
	try {
		const cached = await cachedWorks();
		if (cached.length > 0) {
			state.works = cached;
			state.byId = new Map(cached.map((w) => [w.id, w]));
			state.index = ((await kvGet('catalog-index')) as CatalogIndex | undefined) ?? null;
			state.status = 'ready';
			state.fromCache = true;
			onUpdate({ ...state });
		}
	} catch {
		// cache unavailable — continue to network
	}

	// 2. Network refresh (real catalog, then dev fixture).
	for (const root of [`${base}/catalog`, `${base}/catalog-dev`]) {
		try {
			const { index, works } = await loadFromNetwork(root);
			// Ignore a fixture if we already have a bigger real catalog cached.
			if (state.fromCache && state.works.length > works.length * 2) break;
			state.works = works;
			state.byId = new Map(works.map((w) => [w.id, w]));
			state.index = index;
			state.status = 'ready';
			state.error = null;
			onUpdate({ ...state });
			void kvSet('catalog-index', index);
			void cacheWorks(works);
			return state;
		} catch (e) {
			state.error = e instanceof Error ? e.message : String(e);
		}
	}

	if (state.status !== 'ready') {
		state.status = 'error';
		onUpdate({ ...state });
	}
	return state;
}
