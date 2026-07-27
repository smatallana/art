/**
 * Local persistence (IndexedDB via idb).
 * - `events`: append-only interaction log — the source of truth for the model.
 * - `kv`: session snapshots, settings, sync cursors.
 * - `works`: cached catalog shards for offline use.
 * Every write is immediate; nothing user-generated is ever kept only in memory.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { AppEvent } from './engine/events';
import type { Work } from './catalog/types';

const DB_NAME = 'beholder';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(d) {
				if (!d.objectStoreNames.contains('events')) {
					const events = d.createObjectStore('events', { keyPath: 'id' });
					events.createIndex('at', 'at');
				}
				if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
				if (!d.objectStoreNames.contains('works')) d.createObjectStore('works', { keyPath: 'id' });
			}
		});
	}
	return dbPromise;
}

export async function appendEvent(event: AppEvent): Promise<void> {
	await (await db()).put('events', event);
}

export async function allEvents(): Promise<AppEvent[]> {
	const rows = (await (await db()).getAllFromIndex('events', 'at')) as AppEvent[];
	return rows;
}

export async function eventCount(): Promise<number> {
	return (await db()).count('events');
}

export async function clearEvents(): Promise<void> {
	await (await db()).clear('events');
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
	return (await db()).get('kv', key) as Promise<T | undefined>;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	await (await db()).put('kv', value, key);
}

export async function kvDelete(key: string): Promise<void> {
	await (await db()).delete('kv', key);
}

export async function cacheWorks(works: Work[]): Promise<void> {
	const d = await db();
	const tx = d.transaction('works', 'readwrite');
	for (const w of works) void tx.store.put(w);
	await tx.done;
}

export async function cachedWorks(): Promise<Work[]> {
	return (await db()).getAll('works') as Promise<Work[]>;
}

export async function clearAllLocalData(): Promise<void> {
	const d = await db();
	await Promise.all([d.clear('events'), d.clear('kv'), d.clear('works')]);
}

/** Ask the browser to make our storage durable (silent heuristic on iOS). */
export async function requestPersistence(): Promise<boolean> {
	try {
		if (navigator.storage?.persist) return await navigator.storage.persist();
	} catch {
		// ignore — persistence is best-effort
	}
	return false;
}
