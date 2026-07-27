/** Shared helpers: hashing, tokens, CORS, JSON responses. */

export interface Env {
	DB: D1Database;
	APP_ORIGIN: string;
	APP_START_URL: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

export function allowedOrigin(env: Env, origin: string | null): string | null {
	if (!origin) return null;
	if (origin === env.APP_ORIGIN || DEV_ORIGINS.includes(origin)) return origin;
	return null;
}

export function corsHeaders(env: Env, origin: string | null): HeadersInit {
	const allowed = allowedOrigin(env, origin);
	if (!allowed) return {};
	return {
		'access-control-allow-origin': allowed,
		'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
		'access-control-allow-headers': 'authorization,content-type',
		'access-control-max-age': '86400',
		vary: 'origin'
	};
}

export function json(
	data: unknown,
	env: Env,
	origin: string | null,
	status = 200
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json', ...corsHeaders(env, origin) }
	});
}

export function error(
	message: string,
	env: Env,
	origin: string | null,
	status = 400
): Response {
	return json({ error: message }, env, origin, status);
}

export function randomToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex — only hashes of bearer tokens/codes ever touch the DB. */
export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function isoInDays(days: number): string {
	return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}
