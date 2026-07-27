/**
 * Memory: SM-2-lite spaced repetition over works marked "remember this",
 * derived purely from the event log (fully replayable/syncable).
 *
 * Levels map to intervals; a review outcome moves the level:
 *   recognized → +1 level    partial → stay    missed → back to level 0
 * A work is "known" once it reaches KNOWN_LEVEL.
 * Tone is deliberately gentle: self-graded reveal, no scores, no streaks.
 */
import type { AppEvent } from './events';

export const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120];
export const KNOWN_LEVEL = 3;

export interface MemoryItem {
	work: string;
	level: number;
	lastReviewAt: string; // ISO — the remember event or last review
	dueAt: string;
	reviews: number;
	known: boolean;
}

function addDays(iso: string, days: number): string {
	return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

/** Fold the event log into per-work memory state. */
export function memoryItems(events: AppEvent[]): MemoryItem[] {
	const items = new Map<string, MemoryItem>();
	for (const e of events) {
		if (e.t === 'remember') {
			if (!items.has(e.work)) {
				items.set(e.work, {
					work: e.work,
					level: 0,
					lastReviewAt: e.at,
					dueAt: addDays(e.at, INTERVALS_DAYS[0] as number),
					reviews: 0,
					known: false
				});
			}
		} else if (e.t === 'memory_review') {
			const item = items.get(e.work);
			if (!item) continue;
			if (e.outcome === 'recognized')
				item.level = Math.min(item.level + 1, INTERVALS_DAYS.length - 1);
			else if (e.outcome === 'missed') item.level = 0;
			item.reviews++;
			item.lastReviewAt = e.at;
			item.dueAt = addDays(e.at, INTERVALS_DAYS[item.level] as number);
			item.known = item.level >= KNOWN_LEVEL;
		}
	}
	return [...items.values()];
}

/** Items due for review at `now`, most overdue first. */
export function dueItems(events: AppEvent[], now: Date = new Date()): MemoryItem[] {
	return memoryItems(events)
		.filter((i) => new Date(i.dueAt).getTime() <= now.getTime())
		.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function knownItems(events: AppEvent[]): MemoryItem[] {
	return memoryItems(events).filter((i) => i.known);
}
