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
		| { t: 'session_end'; shown: number; answered: number; insights?: SessionEndInsights }
		| {
				t: 'pair_choice';
				a: string; // work id
				b: string;
				pick: 'a' | 'b' | 'both' | 'neither' | 'unsure';
				ms: number | null; // decision time; weak signal, can be disabled
		  }
		| { t: 'strength'; a: string; b: string; level: 'slight' | 'clear' | 'strong' }
		| { t: 'reaction'; work: string; emotions: EmotionId[]; elements: ElementId[] }
		| { t: 'rating'; work: string; value: 1 | 2 | 3 | 4 | 5 }
		| { t: 'save'; work: string }
		| { t: 'unsave'; work: string }
		| { t: 'remember'; work: string } // "I want to remember this one"
		| { t: 'memory_review'; work: string; outcome: 'recognized' | 'partial' | 'missed' }
		| {
				/** User-initiated pass on a pair. Historic 'not-now' events were
				 *  emitted automatically on image load failures and are ignored by
				 *  every fold; only 'pass' carries preference signal. The problem
				 *  reasons (image-quality/format/repeat/other) come from "Report a
				 *  problem" and are masked from the model by the same rule. */
				t: 'skip';
				work: string;
				reason:
					| 'pass'
					| 'not-now'
					| 'seen-too-often'
					| 'image-quality'
					| 'format'
					| 'repeat'
					| 'other'
					| null;
		  }
		| {
				/** Optional context on a both/neither/unsure answer. Stored as
				 *  evidence for insights; 'image-quality' / 'hard-to-judge' mark
				 *  content problems, never taste. The model fold gives
				 *  pair_feedback no weight — the pair_choice carried the signal. */
				t: 'pair_feedback';
				a: string;
				b: string;
				kind: 'shared' | 'pushed-away' | 'unsure-why';
				aspects: PairAspect[];
		  }
		| {
				/** Infrastructure: an artwork image failed to load. Never treated
				 *  as preference — kept for diagnostics only. */
				t: 'image_error';
				work: string;
				context: 'session' | 'detail';
		  }
		| {
				/** Tombstone: the listed event ids are excluded from every fold
				 *  (sync-safe undo — events are never deleted, only masked). */
				t: 'undo';
				ids: string[];
		  }
		| { t: 'familiar'; work: string; level: 'knew-it' | 'seen-before' | 'new-to-me' }
		| { t: 'seen_in_person'; work: string; museum: string | null }
		| {
				/** A real-world photo was matched (work id) or archived unmatched (null). */
				t: 'photo_capture';
				work: string | null;
		  }
		| { t: 'note'; work: string; text: string }
		| {
				/** Imported starting hypotheses. The spec travels inside the event so
				 *  the log stays fully self-contained for export/replay. */
				t: 'prior_import';
				spec: PriorSpec;
		  }
	);

export interface PriorSpec {
	version: number;
	label: string;
	/** dim id → prior mean in [-1, 1]; imported with high variance + provisional flag */
	weights: Record<string, number>;
	/** artist display-name fragments → seed affinity in [-1, 1] */
	artists: Record<string, number>;
	/** dims the import is explicitly unsure about (kept wide) */
	uncertain: string[];
}

export type PairAspect =
	| 'subject'
	| 'color'
	| 'style'
	| 'atmosphere'
	| 'emotion'
	| 'composition'
	| 'technique'
	| 'too-decorative'
	| 'too-abstract'
	| 'too-busy'
	| 'flat'
	| 'no-pull'
	| 'too-similar'
	| 'image-quality'
	| 'hard-to-judge'
	| 'not-sure';

export type AppEventType = AppEvent['t'];

/**
 * Aspects that mark the PAIR as broken content (bad reproduction, impossible
 * comparison) rather than expressing taste. A pair whose last feedback carries
 * one of these must contribute NOTHING to the model — in either direction.
 */
export const CONTENT_PROBLEM_ASPECTS: ReadonlySet<PairAspect> = new Set([
	'image-quality',
	'hard-to-judge'
]);

/**
 * The conclusions a finished session froze into its session_end event —
 * compact (a few hundred bytes; the sync layer caps events at 16 KiB) and
 * display-ready. `z` is each pattern dim's model z-score AT RECORD TIME so
 * the profile can later say strengthened/weakened/changed honestly; labels
 * are snapshots in the language active when recorded. The model fold
 * ignores this event entirely: conclusions are records, never evidence.
 */
export interface SessionEndInsights {
	v: 1;
	patterns: { dim: string; label: string; n: number; s: 1 | -1; z: number }[];
	counter?: { dim: string; label: string };
	open?: { dim: string; label: string };
	rejection?: { aspect: string; n: number };
	shared?: { aspect: string; n: number };
	facts: { erasSeen: number; topEra: string | null; saved: number };
	answered: number;
}

/**
 * Skip reasons from "Report a problem" (pre-choice): the pair advances
 * unanswered and the model ignores these by the only-'pass'-folds rule.
 * Repeated reports also feed the session's recovery trigger.
 */
export const PROBLEM_SKIP_REASONS: ReadonlySet<string> = new Set([
	'image-quality',
	'format',
	'repeat',
	'other'
]);

/**
 * Events that retroactively change how an already-folded pair_choice counts.
 * The incremental model path cannot look ahead, so recording one of these
 * requires a full rebuild from the log (cheap at personal-log scale).
 */
export function isRetroactiveFoldEvent(
	e: AppEvent
): e is Extract<AppEvent, { t: 'strength' | 'pair_feedback' }> {
	return e.t === 'strength' || e.t === 'pair_feedback';
}

/**
 * The events every fold should consume: undo tombstones are applied (masked
 * events and the tombstones themselves are removed). Raw events still sync
 * and export unchanged — masking is a read-time concern.
 */
export function effectiveEvents(events: AppEvent[]): AppEvent[] {
	const undone = new Set<string>();
	for (const e of events) {
		if (e.t === 'undo') for (const id of e.ids) undone.add(id);
	}
	if (undone.size === 0) return events.filter((e) => e.t !== 'undo');
	return events.filter((e) => e.t !== 'undo' && !undone.has(e.id));
}

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

/** Omit that distributes over unions (plain Omit collapses them). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type AppEventPayload = DistributiveOmit<AppEvent, keyof Base>;

/** Create a fully-stamped event from a payload. */
export function makeEvent<T extends AppEventPayload>(payload: T): AppEvent {
	const now = new Date();
	return {
		id: crypto.randomUUID(),
		at: now.toISOString(),
		device: deviceId(),
		hour: now.getHours(),
		...payload
	} as AppEvent;
}
