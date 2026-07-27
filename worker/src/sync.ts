/**
 * Event sync: append-only, idempotent by (user_id, event id).
 * Push accepts a batch and silently skips already-known ids; pull streams
 * events after a server sequence cursor so any device can catch up.
 */
import { type Env } from './util';

export interface WireEvent {
	id: string;
	at: string;
	[key: string]: unknown;
}

const MAX_BATCH = 500;
const MAX_EVENT_BYTES = 16 * 1024;

export interface PushResult {
	accepted: number;
	skipped: number;
	serverSeq: number;
}

export async function pushEvents(
	env: Env,
	userId: string,
	events: WireEvent[]
): Promise<PushResult | { error: string }> {
	if (!Array.isArray(events)) return { error: 'events must be an array' };
	if (events.length > MAX_BATCH) return { error: `batch too large (max ${MAX_BATCH})` };
	let accepted = 0;
	let skipped = 0;
	for (const e of events) {
		if (!e || typeof e.id !== 'string' || typeof e.at !== 'string') {
			skipped++;
			continue;
		}
		const payload = JSON.stringify(e);
		if (payload.length > MAX_EVENT_BYTES) {
			skipped++;
			continue;
		}
		const result = await env.DB.prepare(
			'INSERT OR IGNORE INTO events (user_id, id, at, payload) VALUES (?, ?, ?, ?)'
		)
			.bind(userId, e.id, e.at, payload)
			.run();
		if (result.meta.changes > 0) accepted++;
		else skipped++;
	}
	const seqRow = await env.DB.prepare(
		'SELECT COALESCE(MAX(server_seq), 0) AS seq FROM events WHERE user_id = ?'
	)
		.bind(userId)
		.first<{ seq: number }>();
	return { accepted, skipped, serverSeq: seqRow?.seq ?? 0 };
}

export interface PullResult {
	events: unknown[];
	serverSeq: number;
	hasMore: boolean;
}

export async function pullEvents(env: Env, userId: string, after: number): Promise<PullResult> {
	const rows = await env.DB.prepare(
		'SELECT server_seq, payload FROM events WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC LIMIT ?'
	)
		.bind(userId, after, MAX_BATCH + 1)
		.all<{ server_seq: number; payload: string }>();
	const list = rows.results ?? [];
	const hasMore = list.length > MAX_BATCH;
	const page = hasMore ? list.slice(0, MAX_BATCH) : list;
	const last = page.length > 0 ? (page[page.length - 1] as { server_seq: number }).server_seq : after;
	return {
		events: page.map((r) => JSON.parse(r.payload)),
		serverSeq: last,
		hasMore
	};
}

export async function exportAll(env: Env, userId: string): Promise<unknown> {
	const user = await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
		.bind(userId)
		.first();
	const rows = await env.DB.prepare(
		'SELECT payload FROM events WHERE user_id = ? ORDER BY server_seq ASC'
	)
		.bind(userId)
		.all<{ payload: string }>();
	return {
		app: 'beholder',
		exportVersion: 1,
		exportedAt: new Date().toISOString(),
		user,
		events: (rows.results ?? []).map((r) => JSON.parse(r.payload))
	};
}

export async function deleteAccount(env: Env, userId: string): Promise<void> {
	// FK cascades remove sessions, auth codes and events.
	await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}
