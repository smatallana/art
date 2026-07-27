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
import type { TasteModel } from './model';
import { historyFromEvents, recordShown, selectPair, type SelectionHistory } from './selector';

export const DEFAULT_SESSION_LENGTH = 12;
export const CALIBRATION_TARGET = 40; // pair answers before calibration ends

export interface SessionPair {
	aId: string;
	bId: string;
	probe: 'cross-era' | 'cross-subject' | 'within-stratum' | 'coverage';
	slot: SlotKind | 'calibration';
}

export interface SessionState {
	id: string;
	mode: 'calibration' | 'daily';
	length: number;
	position: number; // answered so far in this session
	current: SessionPair | null;
	phase: 'choosing' | 'revealed' | 'done';
	startedAt: string;
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
}

export interface SessionEngine {
	state: SessionState;
	history: SelectionHistory;
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
	const engine: SessionEngine = { state, history };
	nextPair(engine, ctx);
	return engine;
}

/** Restore a session from a snapshot + the event log. */
export function resumeSession(snapshot: SessionState, events: AppEvent[]): SessionEngine {
	return { state: snapshot, history: historyFromEvents(events) };
}

function nextPair(engine: SessionEngine, ctx: SessionContext): void {
	if (engine.state.position >= engine.state.length) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	const useSmart = engine.state.mode === 'daily' && ctx.model != null;
	const pair = useSmart
		? selectPairSmart(
				ctx.works,
				engine.history,
				ctx.model as TasteModel,
				ctx.events,
				ctx.workById,
				{
					seed: ctx.seed
				}
			)
		: selectPair(ctx.works, engine.history, { seed: ctx.seed });
	if (!pair) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	recordShown(engine.history, pair.a, pair.b);
	engine.state.current = {
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
