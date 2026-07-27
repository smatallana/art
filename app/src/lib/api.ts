/**
 * Beholder API client (Cloudflare Worker).
 * The base URL ships in static/api-config.json so the static app can point
 * at the worker without a rebuild; when empty, account features stay hidden
 * and the app remains fully local (guest mode).
 */
import { base } from '$app/paths';
import type { AppEvent } from './engine/events';

const TOKEN_KEY = 'beholder-token';

export interface ApiUser {
	id: string;
	email: string | null;
	name: string | null;
}

let cachedBase: string | null | undefined;

export async function apiBase(): Promise<string | null> {
	if (cachedBase !== undefined) return cachedBase;
	try {
		const res = await fetch(`${base}/api-config.json`);
		if (!res.ok) throw new Error(String(res.status));
		const cfg = (await res.json()) as { apiBase?: string };
		cachedBase = cfg.apiBase ? cfg.apiBase.replace(/\/$/, '') : null;
	} catch {
		cachedBase = null;
	}
	return cachedBase;
}

export function getToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setToken(token: string | null): void {
	try {
		if (token) localStorage.setItem(TOKEN_KEY, token);
		else localStorage.removeItem(TOKEN_KEY);
	} catch {
		// storage unavailable
	}
}

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
	const root = await apiBase();
	if (!root) throw new Error('api-not-configured');
	const headers = new Headers(init.headers);
	if (init.body) headers.set('content-type', 'application/json');
	if (auth) {
		const token = getToken();
		if (!token) throw new Error('not-signed-in');
		headers.set('authorization', `Bearer ${token}`);
	}
	const res = await fetch(`${root}${path}`, { ...init, headers });
	if (res.status === 401) {
		if (auth) setToken(null);
		throw new Error('unauthorized');
	}
	if (!res.ok) throw new Error(`api-${res.status}`);
	return res.json() as Promise<T>;
}

export const api = {
	health: () => call<{ ok: boolean; auth: string }>('/health', {}, false),
	exchange: (otc: string, device: string) =>
		call<{ token: string; user: ApiUser }>(
			'/auth/exchange',
			{ method: 'POST', body: JSON.stringify({ otc, device }) },
			false
		),
	me: () => call<{ user: ApiUser }>('/me'),
	logout: () => call<{ ok: true }>('/auth/logout', { method: 'POST' }),
	push: (events: AppEvent[]) =>
		call<{ accepted: number; skipped: number; serverSeq: number }>('/sync/push', {
			method: 'POST',
			body: JSON.stringify({ events })
		}),
	pull: (after: number) =>
		call<{ events: AppEvent[]; serverSeq: number; hasMore: boolean }>(`/sync/pull?after=${after}`),
	exportRemote: () => call<unknown>('/export'),
	deleteAccount: () => call<{ ok: true }>('/account', { method: 'DELETE' })
};

/** URL that starts the Google sign-in dance on the worker origin. */
export async function signInUrl(): Promise<string | null> {
	const root = await apiBase();
	return root ? `${root}/auth/google/start` : null;
}
