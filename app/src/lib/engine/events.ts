/**
 * The event log — every user interaction as an immutable, syncable record.
 * The taste model is a pure function of this log (event sourcing): it can be
 * recomputed, upgraded, exported, and audited. Times are ISO-8601 UTC.
 */

export type EmotionId =
	| 'moved'
	| 'calm'
	| 'unsettled'
	| 'intrigued'
	| 'delighted'
	| 'melancholic'
	| 'awed'
	| 'indifferent';

export type ElementId =
	| 'color'
	| 'atmosphere'
	| 'composition'
	| 'subject'
	| 'face'
	| 'mystery'
	| 'story'
	| 'technique'
	| 'light';

interface Base {
	id: string; // uuid v4 — idempotency key for sync
	at: string; // ISO timestamp
	device: string; // stable anonymous device id
	hour: number; // local hour 0-23 (context signal; coarse by design)
}

export type AppEvent = Base &
	(
		| { t: 'session_start'; mode: 'calibration' | 'daily' }
		| { t: 'session_end'; shown: number; answered: number }
		| {
				t: 'pair_choice';
				a: string; // work id
				b: string;
				pick: 'a' | 'b' | 'both' | 'neither' | 'unsure';
				strength: 'slight' | 'clear' | 'strong' | null;
				ms: number | null; // decision time; weak signal, can be disabled
		  }
		| { t: 'reaction'; work: string; emotions: EmotionId[]; elements: ElementId[] }
		| { t: 'rating'; work: string; value: 1 | 2 | 3 | 4 | 5 }
		| { t: 'save'; work: string }
		| { t: 'unsave'; work: string }
		| { t: 'remember'; work: string } // "I want to remember this one"
		| { t: 'skip'; work: string; reason: 'not-now' | 'seen-too-often' | null }
		| { t: 'familiar'; work: string; level: 'knew-it' | 'seen-before' | 'new-to-me' }
		| { t: 'seen_in_person'; work: string; museum: string | null }
		| { t: 'note'; work: string; text: string }
		| { t: 'prior_import'; version: number } // owner's manual hypotheses loaded
	);

export type AppEventType = AppEvent['t'];

let cachedDeviceId: string | null = null;

export function deviceId(): string {
	if (cachedDeviceId) return cachedDeviceId;
	const KEY = 'beholder-device';
	let id = null;
	try {
		id = localStorage.getItem(KEY);
	} catch {
		// storage unavailable (private mode edge cases)
	}
	if (!id) {
		id = crypto.randomUUID().slice(0, 8);
		try {
			localStorage.setItem(KEY, id);
		} catch {
			// keep in-memory id
		}
	}
	cachedDeviceId = id;
	return id;
}

/** Create a fully-stamped event from a payload. */
export function makeEvent<T extends Omit<AppEvent, keyof Base>>(payload: T): AppEvent {
	const now = new Date();
	return {
		id: crypto.randomUUID(),
		at: now.toISOString(),
		device: deviceId(),
		hour: now.getHours(),
		...payload
	} as AppEvent;
}
