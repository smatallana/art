/**
 * Reactive i18n facade. `t` looks like the plain strings object every
 * component always imported, but each property access resolves against the
 * ACTIVE language — the read of `lang.current` ($state) during render makes
 * every consumer reactive to a language switch with no component changes.
 */
import { t as en, type Strings } from './en';
import { es } from './es';
import { lang, setLang, type Lang } from './lang.svelte';

export const t: Strings = new Proxy({} as Strings, {
	get(_, key) {
		return (lang.current === 'es' ? es : en)[key as keyof Strings];
	}
});

export { lang, setLang, type Lang, type Strings };
