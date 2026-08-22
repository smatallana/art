<script lang="ts">
	import { base } from '$app/paths';
	import type { Work } from '../catalog/types';
	import { blindParts } from '../engine/describe';
	import { t } from '../i18n';

	/** Dev-fixture images are site-relative; museum/R2 images are absolute. */
	function resolveSrc(url: string): string {
		return /^https?:\/\//.test(url) ? url : `${base}/${url}`;
	}

	let {
		work,
		size = 'display',
		blind = false,
		onError = undefined
	}: {
		work: Work;
		size?: 'thumb' | 'display';
		/** Blind comparison phase: alt text must not leak title or artist. */
		blind?: boolean;
		onError?: (workId: string) => void;
	} = $props();

	// Blind phase: an identity-neutral visual description when the tags allow
	// one (content parity for screen readers), the plain fallback otherwise.
	const altText = $derived.by(() => {
		if (!blind) return t.a11y.artworkImage(work.title);
		const parts = blindParts(work);
		return parts ? t.a11y.artworkBlindDescribed(parts) : t.a11y.artworkBlind;
	});

	let loaded = $state(false);
	let failed = $state(false);
	let triedFresh = $state(false);
	let triedFallback = $state(false);

	const primarySrc = $derived(
		resolveSrc(size === 'thumb' ? work.images.thumb : work.images.display)
	);
	let src = $state('');
	$effect(() => {
		// reset when the work changes
		src = primarySrc;
		loaded = false;
		failed = false;
		triedFresh = false;
		triedFallback = false;
	});

	/**
	 * The service worker caches images CacheFirst for 60 days, and no-cors
	 * image responses are opaque — a 403/429 or a truncated body gets cached
	 * as if it were a picture and then served forever (real-user finding: one
	 * artwork permanently blank on one phone). On error, evict the poisoned
	 * entries and retry once from the network before degrading.
	 */
	async function evictCached(current: string): Promise<void> {
		try {
			if ('caches' in window) {
				const cache = await caches.open('artwork-images');
				await cache.delete(resolveSrc(work.images.display), { ignoreVary: true });
				await cache.delete(resolveSrc(work.images.thumb), { ignoreVary: true });
			}
		} catch {
			// cache API unavailable (private mode) — nothing to evict
		}
		try {
			// The browser's OWN http cache may hold the same opaque failure;
			// cache:'reload' forces a network round-trip that refreshes both.
			await fetch(current, { mode: 'no-cors', cache: 'reload' });
		} catch {
			// offline — the retry below will fail and degrade normally
		}
	}

	function handleError(): void {
		if (!triedFresh) {
			// step 1: drop the (possibly poisoned) cache entries, refetch fresh
			triedFresh = true;
			const current = src;
			void evictCached(current).then(() => {
				// fragment change re-triggers the <img> load; the request URL
				// (fragment stripped) now misses the cache → network
				src = current.includes('#') ? current : `${current}#fresh`;
			});
			return;
		}
		const alternate = resolveSrc(size === 'display' ? work.images.thumb : work.images.display);
		if (!triedFallback && alternate !== src) {
			// step 2: degrade to the other size variant before giving up
			triedFallback = true;
			src = alternate;
			return;
		}
		failed = true;
		onError?.(work.id);
	}
</script>

<figure class="frame" style:aspect-ratio={work.images.aspect}>
	{#if !failed}
		<img
			{src}
			alt={altText}
			class:loaded
			loading="eager"
			decoding="async"
			draggable="false"
			onload={() => (loaded = true)}
			onerror={handleError}
		/>
		{#if !loaded}
			<div class="shimmer" aria-hidden="true"></div>
		{/if}
	{:else}
		<div class="fallback" role="img" aria-label={altText}>
			<svg viewBox="0 0 48 24" width="48" height="24" aria-hidden="true">
				<path
					d="M2 12 C 10 2, 38 2, 46 12 C 38 22, 10 22, 2 12 Z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				/>
				<circle cx="24" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
			</svg>
		</div>
	{/if}
</figure>

<style>
	.frame {
		position: relative;
		/* Browsers give <figure> a default 1em 40px margin; in narrow grid
		   cells (the reveal's 72px reference thumb) that pushed the image
		   40px sideways OVER the neighboring text. */
		margin: 0;
		width: 100%;
		max-height: 100%;
		background: var(--surface);
		border-radius: 4px;
		overflow: hidden;
		box-shadow: var(--shadow-work);
	}

	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		opacity: 0;
		transition: opacity 420ms ease;
	}
	img.loaded {
		opacity: 1;
	}

	.shimmer {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			105deg,
			transparent 40%,
			rgba(236, 231, 223, 0.05) 50%,
			transparent 60%
		);
		background-size: 220% 100%;
		animation: sweep 1.4s ease infinite;
	}
	@keyframes sweep {
		from {
			background-position: 130% 0;
		}
		to {
			background-position: -30% 0;
		}
	}

	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--ink-faint);
	}
</style>
