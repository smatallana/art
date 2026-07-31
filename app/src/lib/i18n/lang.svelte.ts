/**
 * Active UI language — synchronous (localStorage, like the welcome flag) so
 * the first paint already speaks the right language. Default: an explicit
 * stored choice, else the browser language, else English.
 */
import { browser } from '$app/environment';

export type Lang = 'en' | 'es';
const KEY = 'beholder-lang';

function initial(): Lang {
	if (!browser) return 'en';
	try {
		const stored = localStorage.getItem(KEY);
		if (stored === 'en' || stored === 'es') return stored;
		return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
	} catch {
		return 'en';
	}
}

class LangState {
	current: Lang = $state(initial());
}

export const lang = new LangState();

export function setLang(l: Lang): void {
	lang.current = l;
	try {
		localStorage.setItem(KEY, l);
	} catch {
		// storage unavailable — the choice lasts for this visit only
	}
}
