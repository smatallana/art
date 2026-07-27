import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { exchangeOtc } from '../src/auth';
import { nowIso, randomToken, sha256Hex } from '../src/util';
import { fakeEnv, FakeD1 } from './faked1';
import type { Env } from '../src/util';

const ORIGIN = 'https://smatallana.github.io';

async function seedUserWithToken(env: Env): Promise<{ userId: string; token: string }> {
	const db = env.DB as unknown as FakeD1;
	const userId = crypto.randomUUID();
	db.users.set(userId, {
		id: userId,
		google_sub: `sub-${userId}`,
		email: 'user@example.org',
		name: 'Test User',
		created_at: nowIso()
	});
	const otc = randomToken(24);
	db.codes.set(await sha256Hex(otc), {
		code_hash: await sha256Hex(otc),
		user_id: userId,
		expires_at: new Date(Date.now() + 60000).toISOString()
	});
	const result = await exchangeOtc(env, otc, 'test-device');
	if (!result) throw new Error('exchange failed');
	return { userId, token: result.token };
}

function req(path: string, init: RequestInit = {}, token?: string): Request {
	const headers = new Headers(init.headers);
	headers.set('origin', ORIGIN);
	if (token) headers.set('authorization', `Bearer ${token}`);
	if (init.body) headers.set('content-type', 'application/json');
	return new Request(`https://api.example.workers.dev${path}`, { ...init, headers });
}

describe('worker API', () => {
	it('health is public and reports auth configuration', async () => {
		const env = fakeEnv();
		const res = await worker.fetch(req('/health'), env);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; auth: string };
		expect(body.ok).toBe(true);
		expect(body.auth).toBe('unconfigured');
	});

	it('locks CORS to the app origin', async () => {
		const env = fakeEnv();
		const good = await worker.fetch(req('/health'), env);
		expect(good.headers.get('access-control-allow-origin')).toBe(ORIGIN);
		const evil = new Request('https://api.example.workers.dev/health', {
			headers: { origin: 'https://evil.example' }
		});
		const res = await worker.fetch(evil, env);
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('rejects sync without a token', async () => {
		const env = fakeEnv();
		const res = await worker.fetch(
			req('/sync/push', { method: 'POST', body: JSON.stringify({ events: [] }) }),
			env
		);
		expect(res.status).toBe(401);
	});

	it('one-time codes are single-use and expire', async () => {
		const env = fakeEnv();
		const db = env.DB as unknown as FakeD1;
		const userId = crypto.randomUUID();
		db.users.set(userId, {
			id: userId,
			google_sub: 's',
			email: null,
			name: null,
			created_at: nowIso()
		});
		const otc = randomToken(24);
		const hash = await sha256Hex(otc);
		db.codes.set(hash, {
			code_hash: hash,
			user_id: userId,
			expires_at: new Date(Date.now() + 60000).toISOString()
		});
		expect(await exchangeOtc(env, otc, null)).not.toBeNull();
		expect(await exchangeOtc(env, otc, null)).toBeNull(); // burned

		const expired = randomToken(24);
		const expiredHash = await sha256Hex(expired);
		db.codes.set(expiredHash, {
			code_hash: expiredHash,
			user_id: userId,
			expires_at: new Date(Date.now() - 1000).toISOString()
		});
		expect(await exchangeOtc(env, expired, null)).toBeNull();
	});

	it('push is idempotent and pull pages in order', async () => {
		const env = fakeEnv();
		const { token } = await seedUserWithToken(env);
		const events = [
			{ id: 'e1', at: '2026-01-01T10:00:00Z', t: 'save', work: 'aic-1' },
			{ id: 'e2', at: '2026-01-01T10:01:00Z', t: 'skip', work: 'aic-2' }
		];
		const push1 = await worker.fetch(
			req('/sync/push', { method: 'POST', body: JSON.stringify({ events }) }, token),
			env
		);
		expect(((await push1.json()) as { accepted: number }).accepted).toBe(2);

		// Re-push the same batch + one new event → only the new one lands.
		const push2 = await worker.fetch(
			req(
				'/sync/push',
				{
					method: 'POST',
					body: JSON.stringify({
						events: [...events, { id: 'e3', at: '2026-01-01T10:02:00Z', t: 'save', work: 'cma-9' }]
					})
				},
				token
			),
			env
		);
		const body2 = (await push2.json()) as { accepted: number; skipped: number; serverSeq: number };
		expect(body2.accepted).toBe(1);
		expect(body2.skipped).toBe(2);

		const pull = await worker.fetch(req('/sync/pull?after=0', { method: 'GET' }, token), env);
		const pulled = (await pull.json()) as { events: { id: string }[]; serverSeq: number };
		expect(pulled.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
		expect(pulled.serverSeq).toBe(body2.serverSeq);

		// Incremental pull from the cursor returns nothing new.
		const pull2 = await worker.fetch(
			req(`/sync/pull?after=${pulled.serverSeq}`, { method: 'GET' }, token),
			env
		);
		expect(((await pull2.json()) as { events: unknown[] }).events).toHaveLength(0);
	});

	it('sync isolates users from each other', async () => {
		const env = fakeEnv();
		const a = await seedUserWithToken(env);
		const b = await seedUserWithToken(env);
		await worker.fetch(
			req(
				'/sync/push',
				{
					method: 'POST',
					body: JSON.stringify({ events: [{ id: 'ea', at: '2026-01-01T00:00:00Z', t: 'save' }] })
				},
				a.token
			),
			env
		);
		const pullB = await worker.fetch(req('/sync/pull?after=0', { method: 'GET' }, b.token), env);
		expect(((await pullB.json()) as { events: unknown[] }).events).toHaveLength(0);
	});

	it('export returns everything; delete removes the account and data', async () => {
		const env = fakeEnv();
		const { token } = await seedUserWithToken(env);
		await worker.fetch(
			req(
				'/sync/push',
				{
					method: 'POST',
					body: JSON.stringify({ events: [{ id: 'e1', at: '2026-01-01T00:00:00Z', t: 'save' }] })
				},
				token
			),
			env
		);
		const exportRes = await worker.fetch(req('/export', { method: 'GET' }, token), env);
		const exported = (await exportRes.json()) as { events: unknown[]; user: { email: string } };
		expect(exported.events).toHaveLength(1);
		expect(exported.user.email).toBe('user@example.org');

		const del = await worker.fetch(req('/account', { method: 'DELETE' }, token), env);
		expect(del.status).toBe(200);
		// Token is now invalid (cascade removed the session).
		const after = await worker.fetch(req('/me', { method: 'GET' }, token), env);
		expect(after.status).toBe(401);
	});

	it('oversized events and malformed entries are skipped, not fatal', async () => {
		const env = fakeEnv();
		const { token } = await seedUserWithToken(env);
		const res = await worker.fetch(
			req(
				'/sync/push',
				{
					method: 'POST',
					body: JSON.stringify({
						events: [
							{ id: 'ok', at: '2026-01-01T00:00:00Z', t: 'save' },
							{ id: 'big', at: '2026-01-01T00:00:00Z', blob: 'x'.repeat(20000) },
							{ notAnEvent: true }
						]
					})
				},
				token
			),
			env
		);
		const body = (await res.json()) as { accepted: number; skipped: number };
		expect(body.accepted).toBe(1);
		expect(body.skipped).toBe(2);
	});
});
