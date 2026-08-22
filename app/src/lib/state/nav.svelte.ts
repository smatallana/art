/**
 * Origin-aware back navigation. In the installed PWA (standalone display)
 * there is no browser chrome, so drill-in pages need their own way back —
 * but a cold deep link has an empty in-app history, and history.back()
 * there would drop the user out of the app. The root layout marks every
 * real in-app navigation; back() uses real history when it exists and a
 * sensible parent route otherwise.
 */
import { goto } from '$app/navigation';
import { base } from '$app/paths';

let navigated = $state(false);

/** Called by the root layout on every navigation that has a `from` route. */
export function markNavigated(): void {
	navigated = true;
}

/** Go back through real history, or to the fallback parent route. */
export function back(fallback: string): void {
	if (navigated) {
		history.back();
	} else {
		void goto(`${base}${fallback}`);
	}
}
