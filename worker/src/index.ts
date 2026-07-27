/**
 * Beholder API router (Cloudflare Worker + D1).
 * Static PWA lives on GitHub Pages; this Worker owns accounts and the
 * per-user event log. CORS is locked to the app origin.
 */
import {
	authenticate,
	exchangeOtc,
	googleConfigured,
	handleGoogleCallback,
	logout,
	startGoogleAuth
} from './auth';
import { deleteAccount, exportAll, pullEvents, pushEvents, type WireEvent } from './sync';
import { corsHeaders, error, json, type Env } from './util';

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const origin = req.headers.get('origin');

		if (req.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
		}

		try {
			// ── public ────────────────────────────────────────────────────────
			if (url.pathname === '/health') {
				return json(
					{ ok: true, auth: googleConfigured(env) ? 'google' : 'unconfigured' },
					env,
					origin
				);
			}
			if (url.pathname === '/auth/google/start' && req.method === 'GET') {
				return startGoogleAuth(req, env);
			}
			if (url.pathname === '/auth/google/callback' && req.method === 'GET') {
				return handleGoogleCallback(req, env);
			}
			if (url.pathname === '/auth/exchange' && req.method === 'POST') {
				const body = (await req.json().catch(() => null)) as {
					otc?: string;
					device?: string;
				} | null;
				if (!body?.otc) return error('missing otc', env, origin);
				const result = await exchangeOtc(env, body.otc, body.device ?? null);
				if (!result) return error('invalid or expired code', env, origin, 401);
				return json(result, env, origin);
			}

			// ── authenticated ─────────────────────────────────────────────────
			const userId = await authenticate(req, env);
			if (!userId) return error('unauthorized', env, origin, 401);

			if (url.pathname === '/me' && req.method === 'GET') {
				const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?')
					.bind(userId)
					.first();
				return json({ user }, env, origin);
			}
			if (url.pathname === '/auth/logout' && req.method === 'POST') {
				await logout(req, env);
				return json({ ok: true }, env, origin);
			}
			if (url.pathname === '/sync/push' && req.method === 'POST') {
				const body = (await req.json().catch(() => null)) as { events?: WireEvent[] } | null;
				if (!body?.events) return error('missing events', env, origin);
				const result = await pushEvents(env, userId, body.events);
				if ('error' in result) return error(result.error, env, origin);
				return json(result, env, origin);
			}
			if (url.pathname === '/sync/pull' && req.method === 'GET') {
				const after = parseInt(url.searchParams.get('after') ?? '0', 10) || 0;
				return json(await pullEvents(env, userId, after), env, origin);
			}
			if (url.pathname === '/export' && req.method === 'GET') {
				return json(await exportAll(env, userId), env, origin);
			}
			if (url.pathname === '/account' && req.method === 'DELETE') {
				await deleteAccount(env, userId);
				return json({ ok: true }, env, origin);
			}

			return error('not found', env, origin, 404);
		} catch (e) {
			console.error('worker error', e);
			return error('internal error', env, origin, 500);
		}
	}
} satisfies ExportedHandler<Env>;
