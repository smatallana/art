/**
 * Minimal in-memory D1 stand-in covering exactly the SQL this worker issues.
 * Not a SQL engine: statements are pattern-matched. Every query the worker
 * runs MUST have a branch here, so an unrecognized query throws loudly and
 * the test suite catches drift between code and fake.
 */

interface UserRow {
	id: string;
	google_sub: string | null;
	email: string | null;
	name: string | null;
	created_at: string;
}
interface SessionRow {
	token_hash: string;
	user_id: string;
	device: string | null;
	created_at: string;
	expires_at: string;
}
interface CodeRow {
	code_hash: string;
	user_id: string;
	expires_at: string;
}
interface EventRow {
	server_seq: number;
	user_id: string;
	id: string;
	at: string;
	payload: string;
}

export class FakeD1 {
	users = new Map<string, UserRow>();
	sessions = new Map<string, SessionRow>();
	codes = new Map<string, CodeRow>();
	events: EventRow[] = [];
	private seq = 0;

	prepare(sql: string): FakeStatement {
		return new FakeStatement(this, sql.trim().replace(/\s+/g, ' '));
	}

	nextSeq(): number {
		return ++this.seq;
	}
}

class FakeStatement {
	private params: unknown[] = [];
	constructor(
		private db: FakeD1,
		private sql: string
	) {}

	bind(...params: unknown[]): this {
		this.params = params;
		return this;
	}

	async first<T>(): Promise<T | null> {
		const rows = this.execute();
		return (rows[0] as T) ?? null;
	}

	async all<T>(): Promise<{ results: T[] }> {
		return { results: this.execute() as T[] };
	}

	async run(): Promise<{ meta: { changes: number } }> {
		return { meta: { changes: this.executeWrite() } };
	}

	private execute(): unknown[] {
		const { db, sql, params } = this;
		if (sql.startsWith('SELECT id FROM users WHERE google_sub')) {
			for (const u of db.users.values()) if (u.google_sub === params[0]) return [{ id: u.id }];
			return [];
		}
		if (sql.startsWith('SELECT id, email, name FROM users WHERE id')) {
			const u = db.users.get(params[0] as string);
			return u ? [{ id: u.id, email: u.email, name: u.name }] : [];
		}
		if (sql.startsWith('SELECT id, email, name, created_at FROM users WHERE id')) {
			const u = db.users.get(params[0] as string);
			return u ? [{ id: u.id, email: u.email, name: u.name, created_at: u.created_at }] : [];
		}
		if (sql.startsWith('SELECT user_id, expires_at FROM auth_codes')) {
			const c = db.codes.get(params[0] as string);
			return c ? [{ user_id: c.user_id, expires_at: c.expires_at }] : [];
		}
		if (sql.startsWith('SELECT user_id, expires_at FROM sessions')) {
			const s = db.sessions.get(params[0] as string);
			return s ? [{ user_id: s.user_id, expires_at: s.expires_at }] : [];
		}
		if (sql.startsWith('SELECT COALESCE(MAX(server_seq), 0) AS seq FROM events')) {
			const mine = db.events.filter((e) => e.user_id === params[0]);
			return [{ seq: mine.length ? Math.max(...mine.map((e) => e.server_seq)) : 0 }];
		}
		if (sql.startsWith('SELECT server_seq, payload FROM events')) {
			const [userId, after, limit] = params as [string, number, number];
			return db.events
				.filter((e) => e.user_id === userId && e.server_seq > after)
				.sort((a, b) => a.server_seq - b.server_seq)
				.slice(0, limit)
				.map((e) => ({ server_seq: e.server_seq, payload: e.payload }));
		}
		if (sql.startsWith('SELECT payload FROM events')) {
			const [userId] = params as [string];
			return db.events
				.filter((e) => e.user_id === userId)
				.sort((a, b) => a.server_seq - b.server_seq)
				.map((e) => ({ payload: e.payload }));
		}
		throw new Error(`FakeD1: unhandled SELECT: ${sql}`);
	}

	private executeWrite(): number {
		const { db, sql, params } = this;
		if (sql.startsWith('INSERT INTO users')) {
			const [id, sub, email, name, created] = params as [string, string, string, string, string];
			db.users.set(id, { id, google_sub: sub, email, name, created_at: created });
			return 1;
		}
		if (sql.startsWith('INSERT INTO auth_codes')) {
			const [hash, userId, expires] = params as [string, string, string];
			db.codes.set(hash, { code_hash: hash, user_id: userId, expires_at: expires });
			return 1;
		}
		if (sql.startsWith('DELETE FROM auth_codes')) {
			return db.codes.delete(params[0] as string) ? 1 : 0;
		}
		if (sql.startsWith('INSERT INTO sessions')) {
			const [hash, userId, device, created, expires] = params as [
				string,
				string,
				string | null,
				string,
				string
			];
			db.sessions.set(hash, {
				token_hash: hash,
				user_id: userId,
				device,
				created_at: created,
				expires_at: expires
			});
			return 1;
		}
		if (sql.startsWith('DELETE FROM sessions')) {
			return db.sessions.delete(params[0] as string) ? 1 : 0;
		}
		if (sql.startsWith('INSERT OR IGNORE INTO events')) {
			const [userId, id, at, payload] = params as [string, string, string, string];
			if (db.events.some((e) => e.user_id === userId && e.id === id)) return 0;
			db.events.push({ server_seq: db.nextSeq(), user_id: userId, id, at, payload });
			return 1;
		}
		if (sql.startsWith('DELETE FROM users')) {
			const id = params[0] as string;
			const existed = db.users.delete(id);
			for (const [k, s] of db.sessions) if (s.user_id === id) db.sessions.delete(k);
			for (const [k, c] of db.codes) if (c.user_id === id) db.codes.delete(k);
			db.events = db.events.filter((e) => e.user_id !== id);
			return existed ? 1 : 0;
		}
		throw new Error(`FakeD1: unhandled write: ${sql}`);
	}
}

import type { Env } from '../src/util';

export function fakeEnv(overrides: Partial<Env> = {}): Env {
	return {
		DB: new FakeD1() as unknown as D1Database,
		APP_ORIGIN: 'https://smatallana.github.io',
		APP_START_URL: 'https://smatallana.github.io/art/',
		...overrides
	};
}
