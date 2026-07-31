<script lang="ts">
	import { base } from '$app/paths';
	import type { Work } from '../catalog/types';
	import { blindParts } from '../engine/describe';
	import { t } from '../i18n/en';

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
		triedFallback = false;
	});

	function handleError(): void {
		const alternate = resolveSrc(size === 'display' ? work.images.thumb : work.images.display);
		if (!triedFallback && alternate !== src) {
			// display failed → degrade to the other variant before giving up
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
