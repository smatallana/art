/**
 * Google sign-in without third-party cookies (Safari blocks them across
 * github.io ↔ workers.dev):
 *
 *   1. GET  /auth/google/start      → 302 to Google's consent screen
 *   2. GET  /auth/google/callback   → code→tokens, upsert user, mint a
 *                                     one-time code, 302 back into the PWA
 *   3. POST /auth/exchange {otc}    → CORS fetch from the app exchanges the
 *                                     one-time code for a bearer token
 *
 * Bearer tokens are opaque 256-bit values; only their SHA-256 lands in D1.
 */
import { type Env, isoInDays, nowIso, randomToken, sha256Hex } from './util';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SESSION_DAYS = 120;
const OTC_MINUTES = 5;

export function googleConfigured(env: Env): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(req: Request): string {
	const url = new URL(req.url);
	return `${url.origin}/auth/google/callback`;
}

export function startGoogleAuth(req: Request, env: Env): Response {
	if (!googleConfigured(env)) {
		return new Response('Google sign-in is not configured yet.', { status: 501 });
	}
	const state = randomToken(16);
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID as string,
		redirect_uri: redirectUri(req),
		response_type: 'code',
		scope: 'openid email profile',
		state,
		prompt: 'select_account'
	});
	const headers = new Headers({ location: `${GOOGLE_AUTH}?${params}` });
	// Double-submit state: httpOnly cookie on the WORKER origin (first-party
	// during the redirect dance), checked at the callback.
	headers.append(
		'set-cookie',
		`bh_state=${state}; Max-Age=600; Path=/auth; Secure; HttpOnly; SameSite=Lax`
	);
	return new Response(null, { status: 302, headers });
}

interface GoogleTokens {
	id_token?: string;
}

interface GoogleClaims {
	sub: string;
	email?: string;
	name?: string;
}

function decodeJwtClaims(idToken: string): GoogleClaims | null {
	const parts = idToken.split('.');
	if (parts.length !== 3) return null;
	try {
		const payload = JSON.parse(
			atob((parts[1] as string).replace(/-/g, '+').replace(/_/g, '/'))
		) as GoogleClaims;
		return payload.sub ? payload : null;
	} catch {
		return null;
	}
}

export async function handleGoogleCallback(req: Request, env: Env): Promise<Response> {
	if (!googleConfigured(env)) {
		return new Response('Google sign-in is not configured yet.', { status: 501 });
	}
	const url = new URL(req.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const cookieState = /(?:^|;\s*)bh_state=([a-f0-9]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
	if (!code || !state || !cookieState || state !== cookieState) {
		return new Response('Invalid sign-in state. Please try again.', { status: 400 });
	}

	// The token exchange happens server-side; the id_token comes directly from
	// Google over TLS, so decoding its claims without re-verifying the
	// signature is sound here.
	const tokenRes = await fetch(GOOGLE_TOKEN, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID as string,
			client_secret: env.GOOGLE_CLIENT_SECRET as string,
			redirect_uri: redirectUri(req),
			grant_type: 'authorization_code'
		})
	});
	if (!tokenRes.ok) return new Response('Google sign-in failed.', { status: 502 });
	const tokens = (await tokenRes.json()) as GoogleTokens;
	const claims = tokens.id_token ? decodeJwtClaims(tokens.id_token) : null;
	if (!claims) return new Response('Google sign-in failed.', { status: 502 });

	// Upsert user.
	const existing = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?')
		.bind(claims.sub)
		.first<{ id: string }>();
	let userId = existing?.id;
	if (!userId) {
		userId = crypto.randomUUID();
		await env.DB.prepare(
			'INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)'
		)
			.bind(userId, claims.sub, claims.email ?? null, claims.name ?? null, nowIso())
			.run();
	}

	// One-time code → PWA fragment (fragments never reach servers or logs).
	const otc = randomToken(24);
	await env.DB.prepare('INSERT INTO auth_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)')
		.bind(await sha256Hex(otc), userId, new Date(Date.now() + OTC_MINUTES * 60000).toISOString())
		.run();

	return new Response(null, {
		status: 302,
		headers: { location: `${env.APP_START_URL}auth/#otc=${otc}` }
	});
}

export async function exchangeOtc(
	env: Env,
	otc: string,
	device: string | null
): Promise<{ token: string; user: { id: string; email: string | null; name: string | null } } | null> {
	const hash = await sha256Hex(otc);
	const row = await env.DB.prepare(
		'SELECT user_id, expires_at FROM auth_codes WHERE code_hash = ?'
	)
		.bind(hash)
		.first<{ user_id: string; expires_at: string }>();
	if (!row) return null;
	await env.DB.prepare('DELETE FROM auth_codes WHERE code_hash = ?').bind(hash).run();
	if (new Date(row.expires_at).getTime() < Date.now()) return null;

	const token = randomToken(32);
	await env.DB.prepare(
		'INSERT INTO sessions (token_hash, user_id, device, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
	)
		.bind(await sha256Hex(token), row.user_id, device, nowIso(), isoInDays(SESSION_DAYS))
		.run();
	const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?')
		.bind(row.user_id)
		.first<{ id: string; email: string | null; name: string | null }>();
	if (!user) return null;
	return { token, user };
}

export async function authenticate(req: Request, env: Env): Promise<string | null> {
	const header = req.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
	if (!token) return null;
	const row = await env.DB.prepare(
		'SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'
	)
		.bind(await sha256Hex(token))
		.first<{ user_id: string; expires_at: string }>();
	if (!row) return null;
	if (new Date(row.expires_at).getTime() < Date.now()) return null;
	return row.user_id;
}

export async function logout(req: Request, env: Env): Promise<void> {
	const header = req.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
	if (!token) return;
	await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
		.bind(await sha256Hex(token))
		.run();
}
