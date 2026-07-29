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
import { CONTENT_PROBLEM_ASPECTS } from './events';
import type { TasteModel } from './model';
import { historyFromEvents, recordShown, selectPair, type SelectionHistory } from './selector';

export const DEFAULT_SESSION_LENGTH = 12;
export const CALIBRATION_TARGET = 40; // pair answers before calibration ends

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
}

export interface SessionEngine {
	state: SessionState;
	history: SelectionHistory;
	/** Works shown THIS session, per catalog source — feeds the source cap. */
	sourceShown: Map<string, number>;
}

export function createSession(ctx: SessionContext, length = DEFAULT_SESSION_LENGTH): SessionEngine {
	const history = historyFromEvents(ctx.events);
	const totalAnswers = ctx.events.filter((e) => e.t === 'pair_choice').length;
	const state: SessionState = {
		id: crypto.randomUUID(),
		mode: sessionMode(totalAnswers),
		length,
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
	// Rebuild the per-session source counts from this session's answers
	// (skipped-but-shown pairs are lost to a resume; an acceptable undercount).
	const sourceShown = new Map<string, number>();
	if (workById) {
		for (const e of events) {
			if (e.t !== 'pair_choice' || e.at < snapshot.startedAt) continue;
			for (const id of [e.a, e.b]) {
				const src = workById(id)?.source;
				if (src) sourceShown.set(src, (sourceShown.get(src) ?? 0) + 1);
			}
		}
	}
	return { state: snapshot, history: historyFromEvents(events), sourceShown };
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
	return flags >= 2;
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
	const useSmart = engine.state.mode === 'daily' && ctx.model != null;
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
	let pair = pickFrom(pool);
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
