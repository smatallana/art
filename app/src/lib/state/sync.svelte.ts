/**
 * Multi-device sync (runes module).
 * Local IndexedDB is always the source of truth for the UI; when signed in,
 * the append-only log converges with the server:
 *   push — every local event not yet acknowledged (batches ≤400, idempotent)
 *   pull — everything after the stored server cursor; new events merge into
 *          IndexedDB by id and the model rebuilds.
 * Sync runs on init, on visibilitychange, and shortly after each new event
 * (debounced). iOS has no background sync — foreground moments are the hook.
 */
import { api, apiBase, getToken, setToken, type ApiUser } from '../api';
import { allEvents, appendEvent, kvGet, kvSet } from '../db';
import { effectiveEvents } from '../engine/events';
import { deviceId } from '../engine/events';
import type { AppEvent } from '../engine/events';
import { app } from './app.svelte';

const CURSOR_KEY = 'sync-server-seq';
const PUSHED_KEY = 'sync-pushed-upto';

class SyncState {
	available = $state(false); // api configured
	authReady = $state(false); // worker has Google OAuth configured
	user = $state<ApiUser | null>(null);
	status = $state<'idle' | 'syncing' | 'offline' | 'error'>('idle');
	lastSyncAt = $state<string | null>(null);
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	async init(): Promise<void> {
		this.available = (await apiBase()) != null;
		if (!this.available) return;
		void api
			.health()
			.then((h) => (this.authReady = h.auth === 'google'))
			.catch(() => (this.authReady = false));
		if (getToken()) {
			try {
				this.user = (await api.me()).user;
				void this.syncNow();
			} catch {
				this.user = null;
			}
		}
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible' && this.user) void this.syncNow();
			});
		}
	}

	/** Called by the app after each recorded event. */
	schedule(): void {
		if (!this.user) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.syncNow(), 4000);
	}

	async completeSignIn(otc: string): Promise<boolean> {
		try {
			const { token, user } = await api.exchange(otc, deviceId());
			setToken(token);
			this.user = user;
			await this.syncNow(); // guest → account: full local log pushes now
			return true;
		} catch {
			return false;
		}
	}

	async signOut(): Promise<void> {
		try {
			await api.logout();
		} catch {
			// token may already be dead — local sign-out proceeds regardless
		}
		setToken(null);
		this.user = null;
	}

	async deleteAccount(): Promise<void> {
		await api.deleteAccount();
		setToken(null);
		this.user = null;
		await kvSet(CURSOR_KEY, 0);
		await kvSet(PUSHED_KEY, 0);
	}

	async syncNow(): Promise<void> {
		if (!this.user || this.running) return;
		this.running = true;
		this.status = 'syncing';
		try {
			// PUSH: everything after the acknowledged prefix (server dedupes).
			const local = await allEvents();
			const pushedUpto = (await kvGet<number>(PUSHED_KEY)) ?? 0;
			const pending = local.slice(Math.min(pushedUpto, local.length));
			for (let i = 0; i < pending.length; i += 400) {
				await api.push(pending.slice(i, i + 400));
			}
			await kvSet(PUSHED_KEY, local.length);

			// PULL: merge unseen remote events (from other devices).
			let cursor = (await kvGet<number>(CURSOR_KEY)) ?? 0;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set, not UI state
			const known = new Set(local.map((e) => e.id));
			let merged = 0;
			for (let page = 0; page < 40; page++) {
				const res = await api.pull(cursor);
				for (const event of res.events) {
					if (!known.has(event.id)) {
						await appendEvent(event as AppEvent);
						known.add(event.id);
						merged++;
					}
				}
				cursor = res.serverSeq;
				if (!res.hasMore) break;
			}
			await kvSet(CURSOR_KEY, cursor);
			if (merged > 0) {
				app.events = effectiveEvents(await allEvents());
				app.rebuildModel();
				// pushed-upto counts local rows; refresh after merge
				await kvSet(PUSHED_KEY, app.events.length);
			}
			this.status = 'idle';
			this.lastSyncAt = new Date().toISOString();
		} catch (e) {
			this.status = navigator.onLine === false ? 'offline' : 'error';
			console.warn('sync failed', e);
		} finally {
			this.running = false;
		}
	}
}

export const sync = new SyncState();
