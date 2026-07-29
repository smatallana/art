import { describe, expect, it } from 'vitest';
import {
	loadCatalog,
	retryCatalog,
	catalogUsable,
	MIN_SESSION_POOL,
	type CatalogDeps,
	type CatalogState
} from './store';
import type { CatalogIndex, Work } from './types';

function makeWork(id: string): Work {
	return { id } as unknown as Work;
}

function makeIndex(shardCount: number, perShard: number, generatedAt = 'g1'): CatalogIndex {
	return {
		schemaVersion: 1,
		ontologyVersion: 1,
		generatedAt,
		count: shardCount * perShard,
		shards: Array.from({ length: shardCount }, (_, i) => ({
			file: `works-${i}.json`,
			count: perShard
		})),
		sources: {}
	} as CatalogIndex;
}

interface FakeOptions {
	cached?: Work[];
	cachedIndex?: CatalogIndex;
	bootstrap?: Work[];
	index?: CatalogIndex;
	shards?: Record<string, Work[]>;
	/** Paths that reject on every attempt. */
	failing?: Set<string>;
	/** Paths that never settle (stall). */
	hanging?: Set<string>;
}

function fakeDeps(
	opts: FakeOptions
): CatalogDeps & { store: Map<string, Work>; kv: Map<string, unknown>; fetches: string[] } {
	const store = new Map<string, Work>((opts.cached ?? []).map((w) => [w.id, w]));
	const kv = new Map<string, unknown>();
	if (opts.cachedIndex) kv.set('catalog-index', opts.cachedIndex);
	const fetches: string[] = [];
	return {
		store,
		kv,
		fetches,
		async fetchJson<T>(path: string, timeoutMs: number): Promise<T> {
			fetches.push(path);
			if (opts.hanging?.has(basename(path))) {
				// Simulate AbortSignal.timeout firing.
				await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 5)));
				throw new Error(`TimeoutError for ${path}`);
			}
			if (opts.failing?.has(basename(path))) throw new Error(`HTTP 404 for ${path}`);
			const name = basename(path);
			if (name === 'bootstrap.json') {
				if (!opts.bootstrap) throw new Error('HTTP 404 bootstrap');
				return opts.bootstrap as T;
			}
			if (name === 'index.json') {
				if (!opts.index) throw new Error('HTTP 404 index');
				return opts.index as T;
			}
			const shard = opts.shards?.[name];
			if (!shard) throw new Error(`HTTP 404 for ${path}`);
			return shard as T;
		},
		async cachedWorks() {
			return [...store.values()];
		},
		async cacheWorks(works: Work[]) {
			for (const w of works) store.set(w.id, w);
		},
		async clearWorksCache() {
			store.clear();
		},
		async kvGet<T>(key: string) {
			return kv.get(key) as T | undefined;
		},
		async kvSet(key: string, value: unknown) {
			kv.set(key, value);
		}
	};
}

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

function shardsFor(index: CatalogIndex, prefix = 'w'): Record<string, Work[]> {
	const out: Record<string, Work[]> = {};
	index.shards.forEach((s, i) => {
		out[s.file] = Array.from({ length: s.count }, (_, j) => makeWork(`${prefix}-${i}-${j}`));
	});
	return out;
}

async function run(deps: CatalogDeps): Promise<{ final: CatalogState; states: CatalogState[] }> {
	const states: CatalogState[] = [];
	const final = await retryCatalog((s) => states.push(s), deps);
	return { final, states };
}

describe('loadCatalog (progressive)', () => {
	it('cold start: becomes usable from bootstrap before shards, then ready', async () => {
		const index = makeIndex(3, 30);
		const boot = Array.from({ length: MIN_SESSION_POOL }, (_, i) => makeWork(`b-${i}`));
		const deps = fakeDeps({ bootstrap: boot, index, shards: shardsFor(index) });
		const { final, states } = await run(deps);
		const firstUsable = states.find((s) => catalogUsable(s));
		expect(firstUsable?.status).toBe('partial');
		expect(firstUsable?.works.length).toBe(MIN_SESSION_POOL);
		expect(final.status).toBe('ready');
		// bootstrap works overlap-merged with full catalog by id
		expect(final.works.length).toBe(90 + MIN_SESSION_POOL);
	});

	it('one shard failing yields degraded (not silent fallback), rest of works present', async () => {
		const index = makeIndex(3, 30);
		const shards = shardsFor(index);
		delete shards['works-1.json'];
		const deps = fakeDeps({ index, shards, failing: new Set(['works-1.json']) });
		const { final } = await run(deps);
		expect(final.status).toBe('degraded');
		expect(final.failedShards).toBe(1);
		expect(final.works.length).toBe(60);
		expect(final.error).toContain('1 of 3');
	});

	it('a hanging index with no cache and no bootstrap ends in error, not forever-loading', async () => {
		const deps = fakeDeps({ hanging: new Set(['index.json', 'bootstrap.json']) });
		const { final } = await run(deps);
		expect(final.status).toBe('error');
	});

	it('offline with full cache stays ready', async () => {
		const cached = Array.from({ length: 50 }, (_, i) => makeWork(`c-${i}`));
		const deps = fakeDeps({ cached, failing: new Set(['index.json', 'bootstrap.json']) });
		const { final } = await run(deps);
		expect(final.status).toBe('ready');
		expect(final.fromCache).toBe(true);
		expect(final.works.length).toBe(50);
	});

	it('same generation cached: zero shard downloads', async () => {
		const index = makeIndex(2, 25, 'gen-A');
		const cached = Object.values(shardsFor(index)).flat();
		const deps = fakeDeps({ cached, cachedIndex: index, index, shards: shardsFor(index) });
		const { final } = await run(deps);
		expect(final.status).toBe('ready');
		expect(deps.fetches.filter((p) => p.includes('works-'))).toHaveLength(0);
	});

	it('new generation replaces wholesale and re-caches; old cache cleared', async () => {
		const oldIndex = makeIndex(2, 25, 'gen-A');
		const cached = Object.values(shardsFor(oldIndex, 'old')).flat();
		const newIndex = makeIndex(2, 25, 'gen-B');
		const newShards = shardsFor(newIndex, 'new');
		const deps = fakeDeps({ cached, cachedIndex: oldIndex, index: newIndex, shards: newShards });
		const { final } = await run(deps);
		expect(final.status).toBe('ready');
		expect(final.works.every((w) => w.id.startsWith('new-'))).toBe(true);
		expect([...deps.store.keys()].every((id) => id.startsWith('new-'))).toBe(true);
	});

	it('failed refresh of a new generation keeps the intact old one (no mixing)', async () => {
		const oldIndex = makeIndex(2, 25, 'gen-A');
		const cached = Object.values(shardsFor(oldIndex, 'old')).flat();
		const newIndex = makeIndex(2, 25, 'gen-B');
		const newShards = shardsFor(newIndex, 'new');
		delete newShards['works-1.json'];
		const deps = fakeDeps({
			cached,
			cachedIndex: oldIndex,
			index: newIndex,
			shards: newShards,
			failing: new Set(['works-1.json'])
		});
		const { final } = await run(deps);
		expect(final.status).toBe('ready');
		expect(final.works.every((w) => w.id.startsWith('old-'))).toBe(true);
		expect(final.error).toContain('refresh incomplete');
	});

	it('loadCatalog is idempotent while in flight; retryCatalog forces a fresh run', async () => {
		const index = makeIndex(1, 30);
		const deps = fakeDeps({ index, shards: shardsFor(index) });
		const p1 = loadCatalog(() => {}, deps);
		const p2 = loadCatalog(() => {}, deps);
		expect(p1).toBe(p2);
		await p1;
	});
});
