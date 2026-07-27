/** Shared fetch/concurrency helpers for polite, resilient API access. */

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export interface FetchJsonOptions {
	retries?: number;
	baseDelayMs?: number;
	headers?: Record<string, string>;
	timeoutMs?: number;
}

const USER_AGENT = 'BeholderPipeline/0.1 (+https://github.com/smatallana/art)';

/** GET JSON with exponential backoff on 429/5xx/network errors. */
export async function fetchJson<T = unknown>(
	url: string,
	{ retries = 4, baseDelayMs = 1000, headers = {}, timeoutMs = 30000 }: FetchJsonOptions = {}
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (res.ok) return (await res.json()) as T;
			// 4xx other than 429 will not improve with retries.
			if (res.status !== 429 && res.status < 500) {
				throw new Error(`HTTP ${res.status} for ${url}`);
			}
			lastError = new Error(`HTTP ${res.status} for ${url}`);
		} catch (e) {
			lastError = e;
			if (e instanceof Error && e.message.startsWith('HTTP 4')) throw e;
		}
		if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
	}
	throw lastError;
}

/** GET binary content (images) with the pipeline UA and backoff on 429/5xx. */
export async function fetchBuffer(
	url: string,
	{ retries = 3, baseDelayMs = 1000, timeoutMs = 45000 }: FetchJsonOptions = {}
): Promise<Uint8Array> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
				signal: AbortSignal.timeout(timeoutMs),
				redirect: 'follow'
			});
			if (res.ok) return new Uint8Array(await res.arrayBuffer());
			if (res.status !== 429 && res.status < 500) {
				throw new Error(`HTTP ${res.status} for ${url}`);
			}
			lastError = new Error(`HTTP ${res.status} for ${url}`);
		} catch (e) {
			lastError = e;
			if (e instanceof Error && e.message.startsWith('HTTP 4')) throw e;
		}
		if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
	}
	throw lastError;
}

/** HEAD (falling back to ranged GET) to verify an image URL responds. */
export async function probeUrl(url: string, timeoutMs = 20000): Promise<boolean> {
	try {
		const res = await fetch(url, {
			method: 'HEAD',
			headers: { 'user-agent': USER_AGENT },
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'follow'
		});
		if (res.ok) return true;
		if (res.status === 405 || res.status === 403) {
			const res2 = await fetch(url, {
				headers: { 'user-agent': USER_AGENT, range: 'bytes=0-256' },
				signal: AbortSignal.timeout(timeoutMs)
			});
			return res2.ok;
		}
		return false;
	} catch {
		return false;
	}
}

/** Run tasks with a concurrency cap, preserving order of results. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i] as T, i);
		}
	});
	await Promise.all(workers);
	return results;
}

/** Parse the first plausible year from a free-text date ("c. 1660", "1503–1519"). */
export function parseYear(text: string | null | undefined): number | null {
	if (!text) return null;
	const m = text.match(/-?\d{3,4}/);
	if (!m) return null;
	const y = parseInt(m[0], 10);
	return Number.isFinite(y) && Math.abs(y) < 2100 ? y : null;
}

/** Strip HTML tags and collapse whitespace; return null for empty results. */
export function stripHtml(html: string | null | undefined): string | null {
	if (!html) return null;
	const text = html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > 0 ? text : null;
}

/** First `n` sentences of a text, capped at maxChars, for micro-stories. */
export function firstSentences(text: string, n = 2, maxChars = 280): string {
	const parts = text.split(/(?<=[.!?])\s+/).slice(0, n);
	let out = parts.join(' ');
	if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + '…';
	return out;
}
