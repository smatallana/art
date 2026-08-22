/**
 * Session orchestration — a pure state machine over the selectors.
 * Calibration mode sweeps broadly (stratified coverage); daily mode hands
 * selection to the active learner (information gain + exploration +
 * challenge + refutation + consistency slots).
 * The UI appends events and persists snapshots; this module never touches
 * storage, which keeps it fully unit-testable.
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import { selectPairSmart, type SlotKind } from './active';
import { anchorPool, onboardingPool, type CuratedOnboarding } from './curation';
import { CONTENT_PROBLEM_ASPECTS, PROBLEM_SKIP_REASONS } from './events';
import type { TasteModel } from './model';
import { OPENING_SLOTS, selectOpeningPair, type OpeningEditorialData } from './opening';
import { mulberry32 } from './random';
import {
	historyFromEvents,
	pairKey,
	recordShown,
	selectPair,
	type SelectedPair,
	type SelectionHistory
} from './selector';

// The first complete unit of value ends after six choices (fourth external
// review): a fresh eye gets a short, scripted sitting; regulars get eight;
// twelve stays available as a voluntary option from the session summary.
export const FIRST_SESSION_LENGTH = 6;
export const DEFAULT_SESSION_LENGTH = 8;
export const LONG_SESSION_LENGTH = 12;
/** "Sharpen this read" continuation offered right after the first summary. */
export const SHARPEN_SESSION_LENGTH = 4;
/** Below this many answers an early Finish has nothing honest to summarize. */
export const MIN_EARLY_FINISH = 3;
export const CALIBRATION_TARGET = 40; // pair answers before calibration ends

/** Default sitting length by lifetime answers (not sessions — an abandoned
 *  2-answer first session still deserves the short-format restart). */
export function sessionLengthFor(totalPairAnswers: number): number {
	return totalPairAnswers < FIRST_SESSION_LENGTH ? FIRST_SESSION_LENGTH : DEFAULT_SESSION_LENGTH;
}

/**
 * Share of calibration pairs handed to the smart selector, so the product
 * visibly adapts before the 40-answer calibration target: none while the
 * scripted opening runs, then roughly a third, then half.
 */
export function smartShare(totalPairAnswers: number): number {
	if (totalPairAnswers < FIRST_SESSION_LENGTH) return 0;
	if (totalPairAnswers < 20) return 0.3;
	if (totalPairAnswers < CALIBRATION_TARGET) return 0.5;
	return 1;
}

/** No source may supply more than this share of works shown in one session. */
export const SOURCE_SESSION_CAP = 0.4;
/** The cap only engages once enough works have been shown to measure a share. */
const SOURCE_CAP_MIN_SHOWN = 8;
/** Never filter the pool below this size — the selector would starve. */
const SOURCE_CAP_MIN_POOL = 24;

export interface SessionPair {
	aId: string;
	bId: string;
	probe: 'cross-era' | 'cross-subject' | 'within-stratum' | 'coverage';
	slot: SlotKind | 'calibration';
	/** Set when this pair is a deliberate change of direction after a cold
	 *  streak (consecutive neither/unsure or repeated content flags). */
	recovery?: boolean;
}

/** A hypothesis the user explicitly asked this session to test. */
export interface SessionObjective {
	dims: string[];
	label: string;
	createdAt: string;
}

export interface SessionState {
	id: string;
	mode: 'calibration' | 'daily';
	length: number;
	position: number; // answered so far in this session
	current: SessionPair | null;
	phase: 'choosing' | 'revealed' | 'done';
	startedAt: string;
	/** Active test objective — only ever set on daily-mode sessions. */
	objective?: { dims: string[]; label: string };
	/** The user pressed Finish before reaching the session length. */
	endedEarly?: boolean;
}

export function sessionMode(totalPairAnswers: number): 'calibration' | 'daily' {
	return totalPairAnswers < CALIBRATION_TARGET ? 'calibration' : 'daily';
}

export interface SessionContext {
	works: Work[];
	events: AppEvent[];
	model: TasteModel | null;
	workById: (id: string) => Work | undefined;
	seed: number;
	/** Consumed objective from a "Test this pattern" tap, if any. */
	objective?: SessionObjective | null;
	/** The editorial onboarding collection (injected; null in tests without one). */
	curated?: CuratedOnboarding | null;
	/** Committed editorial opening pairs (injected; the filter path is the fallback). */
	opening?: OpeningEditorialData | null;
}

export interface SessionEngine {
	state: SessionState;
	history: SelectionHistory;
	/** Works shown THIS session, per catalog source — feeds the source cap. */
	sourceShown: Map<string, number>;
}

export function createSession(ctx: SessionContext, length?: number): SessionEngine {
	const history = historyFromEvents(ctx.events, ctx.workById);
	const totalAnswers = ctx.events.filter((e) => e.t === 'pair_choice').length;
	const state: SessionState = {
		id: crypto.randomUUID(),
		mode: sessionMode(totalAnswers),
		length: length ?? sessionLengthFor(totalAnswers),
		position: 0,
		current: null,
		phase: 'choosing',
		startedAt: new Date().toISOString()
	};
	// The targeted machinery lives in the smart selector — a calibration
	// session cannot honor the promise, so it never carries the objective.
	if (ctx.objective && state.mode === 'daily' && ctx.objective.dims.length > 0) {
		state.objective = { dims: ctx.objective.dims, label: ctx.objective.label };
	}
	const engine: SessionEngine = { state, history, sourceShown: new Map() };
	nextPair(engine, ctx);
	return engine;
}

/** Restore a session from a snapshot + the event log. */
export function resumeSession(
	snapshot: SessionState,
	events: AppEvent[],
	workById?: (id: string) => Work | undefined
): SessionEngine {
	// Rebuild the per-session source counts from this session's shown pairs
	// (pair_shown covers skipped/abandoned pairs too; answers from logs that
	// predate the event still count via pair_choice).
	const sourceShown = new Map<string, number>();
	const counted = new Set<string>();
	if (workById) {
		for (const e of events) {
			if ((e.t !== 'pair_shown' && e.t !== 'pair_choice') || e.at < snapshot.startedAt) continue;
			const key = pairKey(e.a, e.b);
			if (counted.has(key)) continue;
			counted.add(key);
			for (const id of [e.a, e.b]) {
				const src = workById(id)?.source;
				if (src) sourceShown.set(src, (sourceShown.get(src) ?? 0) + 1);
			}
		}
	}
	const history = historyFromEvents(events, workById);
	// Pre-upgrade logs: the pair on screen was shown but never recorded — put
	// it into the in-memory history so the same slot cannot re-run and the
	// pair cannot be re-selected after this sitting's answers.
	if (
		snapshot.current &&
		workById &&
		!history.seenPairs.has(pairKey(snapshot.current.aId, snapshot.current.bId))
	) {
		const a = workById(snapshot.current.aId);
		const b = workById(snapshot.current.bId);
		if (a && b) recordShown(history, a, b);
	}
	return { state: snapshot, history, sourceShown };
}

/**
 * The pool the selector may draw from right now: onboarding curation during
 * calibration, then the session source cap. Both are advisory — nextPair
 * falls back to the full pool rather than end a session early.
 */
/**
 * A cold streak the session should actively repair: the last 3 answers were
 * all neither/unsure, or the user flagged broken content twice. The next
 * pair pivots to curated anchors instead of continuing the same strategy.
 */
export function needsRecovery(sessionEvents: AppEvent[]): boolean {
	const picks = sessionEvents
		.filter((e): e is Extract<AppEvent, { t: 'pair_choice' }> => e.t === 'pair_choice')
		.map((e) => e.pick);
	const last3 = picks.slice(-3);
	if (last3.length === 3 && last3.every((p) => p === 'neither' || p === 'unsure')) return true;
	const flags = sessionEvents.filter(
		(e) => e.t === 'pair_feedback' && e.aspects.some((a) => CONTENT_PROBLEM_ASPECTS.has(a))
	).length;
	// Reported problem pairs count too (two skip events per reported pair).
	const problemSkips = sessionEvents.filter(
		(e) => e.t === 'skip' && PROBLEM_SKIP_REASONS.has(e.reason ?? '')
	).length;
	return flags + Math.floor(problemSkips / 2) >= 2;
}

/** Anchor pivot needs at least this many works to leave the selector room. */
const RECOVERY_MIN_POOL = 16;

function constrainedPool(engine: SessionEngine, ctx: SessionContext): Work[] {
	const totalAnswers = ctx.events.filter((e) => e.t === 'pair_choice').length;
	let pool =
		engine.state.mode === 'calibration'
			? onboardingPool(ctx.works, totalAnswers, ctx.curated)
			: ctx.works;
	const total = [...engine.sourceShown.values()].reduce((a, n) => a + n, 0);
	if (total < SOURCE_CAP_MIN_SHOWN) return pool;
	const capped = new Set<string>();
	for (const [src, n] of engine.sourceShown) {
		if (n / total > SOURCE_SESSION_CAP) capped.add(src);
	}
	if (capped.size > 0) {
		const filtered = pool.filter((w) => !capped.has(w.source));
		if (filtered.length >= SOURCE_CAP_MIN_POOL) pool = filtered;
	}
	return pool;
}

function nextPair(engine: SessionEngine, ctx: SessionContext): void {
	if (engine.state.position >= engine.state.length) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	const totalAnswers = ctx.events.filter((e) => e.t === 'pair_choice').length;
	// Progressive personalization: calibration hands a growing share of pairs
	// to the smart selector (deterministic per-pair draw — resume-safe). Smart
	// pairs keep their real slot so the record stays truthful.
	const smartDraw = mulberry32(ctx.seed * 8837 + engine.history.interactionIndex * 271)();
	const useSmart =
		ctx.model != null && (engine.state.mode === 'daily' || smartDraw < smartShare(totalAnswers));
	const pickFrom = (works: Work[]) =>
		useSmart
			? selectPairSmart(works, engine.history, ctx.model as TasteModel, ctx.events, ctx.workById, {
					seed: ctx.seed,
					targetDims: engine.state.objective?.dims
				})
			: selectPair(works, engine.history, { seed: ctx.seed });
	let pool = constrainedPool(engine, ctx);
	// Cold-streak repair: pivot the next pair to curated anchors when the
	// session is losing the user (three non-answers or repeated bad content).
	let recovery = false;
	const sessionEvents = ctx.events.filter((e) => e.at >= engine.state.startedAt);
	if (needsRecovery(sessionEvents)) {
		const anchors = anchorPool(pool, ctx.curated);
		if (anchors.length >= RECOVERY_MIN_POOL) {
			pool = anchors;
			recovery = true;
		}
	}
	// The scripted opening covers the first six lifetime interactions (it
	// survives resume and an early-finished first sitting — the remaining
	// slots open session two). Recovery outranks the script; an unfillable
	// slot falls through to the ordinary calibration path.
	let pair: ReturnType<typeof pickFrom> | SelectedPair = null;
	if (
		!recovery &&
		engine.state.mode === 'calibration' &&
		!useSmart &&
		engine.history.interactionIndex < OPENING_SLOTS.length &&
		ctx.curated
	) {
		pair = selectOpeningPair(
			engine.history.interactionIndex,
			ctx.works,
			ctx.curated,
			engine.history,
			ctx.seed,
			ctx.opening
		);
	}
	if (!pair) pair = pickFrom(pool);
	// Constraints are advisory: never end a session because of them.
	if (!pair && pool !== ctx.works) pair = pickFrom(ctx.works);
	if (!pair) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	recordShown(engine.history, pair.a, pair.b);
	for (const w of [pair.a, pair.b]) {
		engine.sourceShown.set(w.source, (engine.sourceShown.get(w.source) ?? 0) + 1);
	}
	engine.state.current = {
		...(recovery ? { recovery: true } : {}),
		aId: pair.a.id,
		bId: pair.b.id,
		probe: pair.probe,
		slot: 'slot' in pair ? (pair.slot as SlotKind) : 'calibration'
	};
	engine.state.phase = 'choosing';
}

/** The user answered the current pair → move to reveal phase. */
export function markAnswered(engine: SessionEngine): void {
	if (engine.state.phase !== 'choosing' || !engine.state.current) return;
	engine.state.position++;
	engine.state.phase = 'revealed';
}

/**
 * Undo from the reveal: the answer is retracted, the SAME pair goes back on
 * screen, and the position rolls back so the sitting keeps its full length
 * (it used to end one pair early per undo). History keeps the pair as shown
 * — the user did see it; only the recorded answer is masked.
 */
export function undoAnswer(engine: SessionEngine): void {
	if (engine.state.phase !== 'revealed') return;
	engine.state.position = Math.max(0, engine.state.position - 1);
	engine.state.phase = 'choosing';
}

/** Leave the reveal → select the next pair (or finish). */
export function advance(engine: SessionEngine, ctx: SessionContext): void {
	if (engine.state.phase !== 'revealed') return;
	nextPair(engine, ctx);
}

/** Skip without answering (does not count toward session length). */
export function skipCurrent(engine: SessionEngine, ctx: SessionContext): void {
	if (engine.state.phase !== 'choosing') return;
	nextPair(engine, ctx);
}

/**
 * The user pressed Finish mid-session with enough answers to summarize:
 * close the session where it stands so the summary renders instead of the
 * exit sending them away empty-handed. Returns false below MIN_EARLY_FINISH
 * — the caller falls back to a plain exit.
 */
export function finishEarly(engine: SessionEngine): boolean {
	if (engine.state.phase === 'done' || engine.state.position < MIN_EARLY_FINISH) return false;
	engine.state.length = engine.state.position; // progress reads honestly
	engine.state.phase = 'done';
	engine.state.current = null;
	engine.state.endedEarly = true;
	return true;
}
