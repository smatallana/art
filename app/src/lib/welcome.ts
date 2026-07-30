/**
 * First-run signal. The welcome screen must be decided SYNCHRONOUSLY —
 * before any async init — or returning visitors would see it flash past
 * while IndexedDB opens. localStorage is the only synchronous storage we
 * have, so the flag lives there (like the auth token), not in the kv store.
 */
import { getToken } from './api';

const WELCOMED_KEY = 'beholder-welcomed';

/** Anchor artwork behind the welcome — must exist in the precached
 *  bootstrap catalog (guarded by onboarding.validate.test.ts). */
export const WELCOME_HERO_ID = 'aic-100191'; // Monet — Stack of Wheat (Thaw, Sunset)

export function hasWelcomed(): boolean {
	try {
		// A signed-in device has necessarily been through sign-in already.
		return localStorage.getItem(WELCOMED_KEY) != null || getToken() != null;
	} catch {
		return true; // storage unavailable — never trap the user on the welcome
	}
}

export function markWelcomed(): void {
	try {
		localStorage.setItem(WELCOMED_KEY, '1');
	} catch {
		// storage unavailable — the welcome may show again; harmless
	}
}

/** "Erase local data" brings the welcome back (owner's decision). */
export function clearWelcomed(): void {
	try {
		localStorage.removeItem(WELCOMED_KEY);
	} catch {
		// storage unavailable
	}
}
