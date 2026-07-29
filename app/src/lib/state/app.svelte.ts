/**
 * Shared reactive app state (Svelte 5 runes module).
 * Catalog + event log + taste model + session lifecycle glue.
 * All persistence is immediate; the model is incrementally updated on every
 * event and fully rebuilt from the log on startup (event sourcing).
 */
import { SvelteSet } from 'svelte/reactivity';
import type { CatalogState } from '../catalog/store';
import { loadCatalog, retryCatalog } from '../catalog/store';
import type { Work } from '../catalog/types';
import { allEvents, appendEvent, kvDelete, kvGet, kvSet, requestPersistence } from '../db';
import type { AppEvent, AppEventPayload } from '../engine/events';
import { effectiveEvents, isRetroactiveFoldEvent, makeEvent } from '../engine/events';
import { applyEvent, modelFromEvents, type TasteModel } from '../engine/model';
import {
	advance as engineAdvance,
	createSession,
	markAnswered,
	resumeSession,
	skipCurrent,
	type SessionContext,
	type SessionEngine,
	type SessionState
} from '../engine/session';

const SESSION_SNAPSHOT_KEY = 'session-snapshot';
const TIMELINE_KEY = 'profile-timeline';

export interface TimelineSnapshot {
	at: string;
	choices: number;
	top: { dim: string; mu: number; z: number }[];
}

class AppState {
	catalog = $state<CatalogState>({
		status: 'idle',
		works: [],
		byId: new Map(),
		index: null,
		fromCache: false,
		loadedShards: 0,
		totalShards: 0,
		failedShards: 0,
		error: null
	});
	events = $state<AppEvent[]>([]);
	model = $state<TasteModel | null>(null);
	engine = $state<SessionEngine | null>(null);
	/** Event ids of the current pair's choice + reveal annotations (undo scope). */
	undoableIds = $state<string[]>([]);
	savedIds = $state<Set<string>>(new SvelteSet());
	rememberedIds = $state<Set<string>>(new SvelteSet());
	initialized = $state(false);
	/** set by the sync module to hear about new events without an import cycle */
	onEventRecorded: (() => void) | null = null;

	get totalChoices(): number {
		return this.events.filter((e) => e.t === 'pair_choice').length;
	}
	get totalSessions(): number {
		return this.events.filter((e) => e.t === 'session_start').length;
	}

	work(id: string): Work | undefined {
		return this.catalog.byId.get(id);
	}

	private sessionCtx(): SessionContext {
		return {
			works: this.catalog.works,
			events: this.events,
			model: this.model,
			workById: (id) => this.catalog.byId.get(id),
			seed: this.events.length + 1
		};
	}

	async init(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		void requestPersistence();
		this.events = effectiveEvents(await allEvents());
		this.recomputeCollections();
		await loadCatalog((s) => {
			this.catalog = s;
			// Rebuild whenever works are available: late-arriving shards let
			// previously unresolvable event references contribute again.
			if (s.works.length > 0) this.rebuildModel();
		});
	}

	/** Re-attempt the catalog load after a failure (Retry affordance). */
	async retryCatalog(): Promise<void> {
		await retryCatalog((s) => {
			this.catalog = s;
			if (s.works.length > 0) this.rebuildModel();
		});
	}

	rebuildModel(): void {
		this.model = modelFromEvents(this.events, {
			workById: (id) => this.catalog.byId.get(id)
		});
	}

	private recomputeCollections(): void {
		const saved = new SvelteSet<string>();
		const remembered = new SvelteSet<string>();
		for (const e of this.events) {
			if (e.t === 'save') saved.add(e.work);
			else if (e.t === 'unsave') saved.delete(e.work);
			else if (e.t === 'remember') remembered.add(e.work);
		}
		this.savedIds = saved;
		this.rememberedIds = remembered;
	}

	async record(payload: AppEventPayload): Promise<AppEvent> {
		const event = makeEvent(payload);
		await appendEvent(event);
		// In-memory view is the effective log: an undo masks its targets and
		// never appears itself (storage and sync keep the full raw log).
		this.events =
			event.t === 'undo'
				? this.events.filter((e) => !event.ids.includes(e.id))
				: [...this.events, event];
		this.recomputeCollections();
		if (this.isRevealAnnotation(event)) this.undoableIds.push(event.id);
		if (this.model) {
			if (isRetroactiveFoldEvent(event)) {
				// strength / pair_feedback change how the ALREADY-applied pair
				// counts; the incremental path cannot look ahead, so rebuild
				// (same pattern as undo; milliseconds at personal-log scale).
				this.rebuildModel();
			} else {
				applyEvent(this.model, event, { workById: (id) => this.catalog.byId.get(id) });
				// shallow-clone to notify runes subscribers of the deep mutation
				this.model = { ...this.model };
			}
		}
		this.onEventRecorded?.();
		return event;
	}

	/** Start a new session or resume an unfinished one (<24h old). */
	async startOrResumeSession(): Promise<void> {
		if (this.catalog.works.length === 0) return;
		if (!this.model) this.rebuildModel();
		const snapshot = (await kvGet<SessionState>(SESSION_SNAPSHOT_KEY)) ?? null;
		if (
			snapshot &&
			snapshot.phase !== 'done' &&
			Date.now() - new Date(snapshot.startedAt).getTime() < 24 * 3600 * 1000
		) {
			this.engine = resumeSession(snapshot, this.events, (id) => this.catalog.byId.get(id));
			return;
		}
		this.engine = createSession(this.sessionCtx());
		await this.record({ t: 'session_start', mode: this.engine.state.mode });
		await this.persistSnapshot();
	}

	async persistSnapshot(): Promise<void> {
		if (this.engine) await kvSet(SESSION_SNAPSHOT_KEY, $state.snapshot(this.engine.state));
	}

	async answerPair(
		pick: 'a' | 'b' | 'both' | 'neither' | 'unsure',
		ms: number | null
	): Promise<void> {
		if (!this.engine?.state.current) return;
		const { aId, bId } = this.engine.state.current;
		const choice = await this.record({ t: 'pair_choice', a: aId, b: bId, pick, ms });
		this.undoableIds = [choice.id];
		markAnswered(this.engine);
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	/** Reveal-screen annotations belong to the current pair's undo scope. */
	private isRevealAnnotation(event: AppEvent): boolean {
		const cur = this.engine?.state.current;
		if (!cur || this.engine?.state.phase !== 'revealed') return false;
		const ids = new Set([cur.aId, cur.bId]);
		if (event.t === 'strength') return ids.has(event.a) && ids.has(event.b);
		if (
			event.t === 'reaction' ||
			event.t === 'save' ||
			event.t === 'unsave' ||
			event.t === 'remember'
		) {
			return ids.has(event.work);
		}
		return false;
	}

	async nextPair(): Promise<void> {
		if (!this.engine) return;
		this.undoableIds = [];
		engineAdvance(this.engine, this.sessionCtx());
		this.engine = { ...this.engine };
		await this.persistSnapshot();
		if (this.engine.state.phase === 'done') {
			await this.record({
				t: 'session_end',
				shown: this.engine.state.position,
				answered: this.engine.state.position
			});
			await kvDelete(SESSION_SNAPSHOT_KEY);
			await this.snapshotTimeline();
		}
	}

	/** Deliberate user pass on the current pair (weak negative on both works). */
	async skipPair(): Promise<void> {
		if (!this.engine?.state.current) return;
		const { aId, bId } = this.engine.state.current;
		await this.record({ t: 'skip', work: aId, reason: 'pass' });
		await this.record({ t: 'skip', work: bId, reason: 'pass' });
		skipCurrent(this.engine, this.sessionCtx());
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	/**
	 * An artwork image failed to load: pure infrastructure. Log it for
	 * diagnostics, advance to a fresh pair — the taste model never sees it.
	 */
	async reportImageFailure(workId: string): Promise<void> {
		if (!this.engine?.state.current) return;
		await this.record({ t: 'image_error', work: workId, context: 'session' });
		skipCurrent(this.engine, this.sessionCtx());
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	/** Undo the current pair's choice and annotations; re-present the pair. */
	async undoLastPair(): Promise<void> {
		if (!this.engine || this.engine.state.phase !== 'revealed') return;
		if (this.undoableIds.length === 0) return;
		await this.record({ t: 'undo', ids: [...this.undoableIds] });
		this.undoableIds = [];
		this.rebuildModel();
		this.engine.state.phase = 'choosing';
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	async endSession(): Promise<void> {
		this.engine = null;
		await kvDelete(SESSION_SNAPSHOT_KEY);
	}

	/** Periodic posterior snapshot → the profile's evolution timeline. */
	private async snapshotTimeline(): Promise<void> {
		if (!this.model) return;
		const entries: TimelineSnapshot['top'] = [];
		for (const [dimId, d] of this.model.dims) {
			if (dimId.startsWith('era.')) continue;
			const z = Math.abs(d.mu) / Math.sqrt(d.variance);
			entries.push({ dim: dimId, mu: d.mu, z });
		}
		entries.sort((a, b) => b.z - a.z);
		const list = ((await kvGet<TimelineSnapshot[]>(TIMELINE_KEY)) ?? []).slice(-49);
		list.push({
			at: new Date().toISOString(),
			choices: this.totalChoices,
			top: entries.slice(0, 8)
		});
		await kvSet(TIMELINE_KEY, list);
	}

	async timeline(): Promise<TimelineSnapshot[]> {
		return (await kvGet<TimelineSnapshot[]>(TIMELINE_KEY)) ?? [];
	}

	async exportData(): Promise<string> {
		const events = await allEvents();
		return JSON.stringify(
			{
				app: 'beholder',
				exportVersion: 1,
				exportedAt: new Date().toISOString(),
				events,
				saved: [...this.savedIds],
				remembered: [...this.rememberedIds]
			},
			null,
			2
		);
	}
}

export const app = new AppState();
