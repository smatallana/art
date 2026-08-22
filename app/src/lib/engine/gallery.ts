/**
 * The seen-works gallery: every painting that has passed before the user's
 * eyes, derived purely from the event log (pair_choice + pair_shown). This
 * is the collector loop's substance — a collection that visibly grows with
 * every sitting — and it makes any future repetition immediately visible.
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import { eraBucket } from './strata';

export interface SeenEntry {
	id: string;
	/** Most recent encounter (ISO). */
	at: string;
	/** The user actively chose this work at least once (pick a/b/both). */
	chosen: boolean;
}

/** Distinct seen works, most recent encounter first. */
export function seenGallery(events: AppEvent[]): SeenEntry[] {
	const byId = new Map<string, SeenEntry>();
	for (const e of events) {
		if (e.t === 'pair_shown') {
			for (const id of [e.a, e.b]) {
				const prev = byId.get(id);
				byId.set(id, { id, at: e.at, chosen: prev?.chosen ?? false });
			}
		} else if (e.t === 'pair_choice') {
			const chosenIds =
				e.pick === 'a' ? [e.a] : e.pick === 'b' ? [e.b] : e.pick === 'both' ? [e.a, e.b] : [];
			for (const id of [e.a, e.b]) {
				const prev = byId.get(id);
				byId.set(id, {
					id,
					at: e.at,
					chosen: (prev?.chosen ?? false) || chosenIds.includes(id)
				});
			}
		}
	}
	// Stable for ties: a pair's two works share a timestamp and keep order.
	return [...byId.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

export const ERA_BUCKET_COUNT = 5; // pre1500 / e1500 / e1700 / e1850 / e1900

/** How many of the five painting eras the seen works span. */
export function eraCoverage(
	entries: SeenEntry[],
	workById: (id: string) => Work | undefined
): number {
	const eras = new Set<string>();
	for (const e of entries) {
		const w = workById(e.id);
		if (!w) continue;
		const b = eraBucket(w);
		if (b !== 'unknown') eras.add(b);
	}
	return eras.size;
}
