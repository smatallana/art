/**
 * Session orchestration — a pure state machine over the selector.
 * The UI appends events and persists snapshots; this module never touches
 * storage, which keeps it fully unit-testable.
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import {
	historyFromEvents,
	recordShown,
	selectPair,
	type SelectedPair,
	type SelectionHistory
} from './selector';

export const DEFAULT_SESSION_LENGTH = 12;
export const CALIBRATION_TARGET = 40; // pair answers before calibration ends

export interface SessionPair {
	aId: string;
	bId: string;
	probe: SelectedPair['probe'];
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

export interface SessionEngine {
	state: SessionState;
	history: SelectionHistory;
}

export function createSession(
	events: AppEvent[],
	works: Work[],
	seed: number,
	length = DEFAULT_SESSION_LENGTH
): SessionEngine {
	const history = historyFromEvents(events);
	const totalAnswers = events.filter((e) => e.t === 'pair_choice').length;
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
	nextPair(engine, works, seed);
	return engine;
}

/** Restore a session from a snapshot + the event log. */
export function resumeSession(
	snapshot: SessionState,
	events: AppEvent[]
): SessionEngine {
	return { state: snapshot, history: historyFromEvents(events) };
}

function nextPair(engine: SessionEngine, works: Work[], seed: number): void {
	if (engine.state.position >= engine.state.length) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	const pair = selectPair(works, engine.history, { seed });
	if (!pair) {
		engine.state.phase = 'done';
		engine.state.current = null;
		return;
	}
	recordShown(engine.history, pair.a, pair.b);
	engine.state.current = { aId: pair.a.id, bId: pair.b.id, probe: pair.probe };
	engine.state.phase = 'choosing';
}

/** The user answered the current pair → move to reveal phase. */
export function markAnswered(engine: SessionEngine): void {
	if (engine.state.phase !== 'choosing' || !engine.state.current) return;
	engine.state.position++;
	engine.state.phase = 'revealed';
}

/** Leave the reveal → select the next pair (or finish). */
export function advance(engine: SessionEngine, works: Work[], seed: number): void {
	if (engine.state.phase !== 'revealed') return;
	nextPair(engine, works, seed);
}

/** Skip without answering (does not count toward session length). */
export function skipCurrent(engine: SessionEngine, works: Work[], seed: number): void {
	if (engine.state.phase !== 'choosing') return;
	nextPair(engine, works, seed);
}
