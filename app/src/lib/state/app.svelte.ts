/**
 * Shared reactive app state (Svelte 5 runes module).
 * Catalog + event log + session lifecycle glue. All persistence is immediate;
 * the UI layer stays thin.
 */
import { SvelteSet } from 'svelte/reactivity';
import type { CatalogState } from '../catalog/store';
import { loadCatalog } from '../catalog/store';
import type { Work } from '../catalog/types';
import {
	allEvents,
	appendEvent,
	eventCount,
	kvDelete,
	kvGet,
	kvSet,
	requestPersistence
} from '../db';
import type { AppEvent, AppEventPayload } from '../engine/events';
import { makeEvent } from '../engine/events';
import {
	advance as engineAdvance,
	createSession,
	markAnswered,
	resumeSession,
	skipCurrent,
	type SessionEngine,
	type SessionState
} from '../engine/session';

const SESSION_SNAPSHOT_KEY = 'session-snapshot';

class AppState {
	catalog = $state<CatalogState>({
		status: 'idle',
		works: [],
		byId: new Map(),
		index: null,
		fromCache: false,
		error: null
	});
	events = $state<AppEvent[]>([]);
	engine = $state<SessionEngine | null>(null);
	savedIds = $state<Set<string>>(new SvelteSet());
	rememberedIds = $state<Set<string>>(new SvelteSet());
	initialized = $state(false);

	get totalChoices(): number {
		return this.events.filter((e) => e.t === 'pair_choice').length;
	}
	get totalSessions(): number {
		return this.events.filter((e) => e.t === 'session_start').length;
	}

	work(id: string): Work | undefined {
		return this.catalog.byId.get(id);
	}

	async init(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		void requestPersistence();
		this.events = await allEvents();
		this.recomputeCollections();
		await loadCatalog((s) => {
			this.catalog = s;
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
		this.events = [...this.events, event];
		this.recomputeCollections();
		return event;
	}

	/** Start a new session or resume an unfinished one (<24h old). */
	async startOrResumeSession(): Promise<void> {
		if (this.catalog.works.length === 0) return;
		const snapshot = (await kvGet<SessionState>(SESSION_SNAPSHOT_KEY)) ?? null;
		if (
			snapshot &&
			snapshot.phase !== 'done' &&
			Date.now() - new Date(snapshot.startedAt).getTime() < 24 * 3600 * 1000
		) {
			this.engine = resumeSession(snapshot, this.events);
			return;
		}
		const seed = (await eventCount()) + 1;
		this.engine = createSession(this.events, this.catalog.works, seed);
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
		await this.record({ t: 'pair_choice', a: aId, b: bId, pick, strength: null, ms });
		markAnswered(this.engine);
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	async nextPair(): Promise<void> {
		if (!this.engine) return;
		engineAdvance(this.engine, this.catalog.works, this.totalChoices + 1);
		this.engine = { ...this.engine };
		await this.persistSnapshot();
		if (this.engine.state.phase === 'done') {
			await this.record({
				t: 'session_end',
				shown: this.engine.state.position,
				answered: this.engine.state.position
			});
			await kvDelete(SESSION_SNAPSHOT_KEY);
		}
	}

	async skipPair(): Promise<void> {
		if (!this.engine?.state.current) return;
		const { aId } = this.engine.state.current;
		await this.record({ t: 'skip', work: aId, reason: 'not-now' });
		skipCurrent(this.engine, this.catalog.works, this.totalChoices + 1);
		this.engine = { ...this.engine };
		await this.persistSnapshot();
	}

	async endSession(): Promise<void> {
		this.engine = null;
		await kvDelete(SESSION_SNAPSHOT_KEY);
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
