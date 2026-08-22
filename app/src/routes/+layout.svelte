<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import { markNavigated } from '$lib/state/nav.svelte';

	let { children } = $props();

	const path = $derived(page.url.pathname);
	const onSession = $derived(path.includes('/session'));

	// Real in-app navigations arm history-back; a cold deep link leaves the
	// BackBar on its fallback route instead of exiting the standalone PWA.
	// type 'enter' covers the initial load AND the router's own first-load
	// URL normalization, which reports a non-null `from` — only link/goto/
	// popstate navigations put a real prior entry in the history stack.
	afterNavigate((nav) => {
		if (nav.from && nav.type !== 'enter') markNavigated();
	});

	onMount(async () => {
		// Register the service worker (production builds only — the virtual
		// module is a no-op stub during dev).
		try {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
		} catch {
			// PWA disabled (dev) or unsupported browser — the app works without it.
		}
	});
</script>

<div class="shell">
	{@render children()}

	{#if !onSession}
		<nav class="tabs" aria-label="Main">
			<a href={`${base}/session/`} class:active={false}>{t.nav.play}</a>
			<a
				href={`${base}/discover/`}
				class:active={path.startsWith(`${base}/discover`) ||
					path.startsWith(`${base}/work`) ||
					path.startsWith(`${base}/snap`)}
			>
				{t.nav.discover}
			</a>
			<a
				href={`${base}/profile/`}
				class:active={path.startsWith(`${base}/profile`) ||
					path.startsWith(`${base}/settings`) ||
					path.startsWith(`${base}/remember`)}
			>
				{t.nav.profile}
			</a>
			<a href={`${base}/saved/`} class:active={path.startsWith(`${base}/saved`)}>{t.nav.saved}</a>
		</nav>
	{/if}
</div>

<style>
	.shell {
		min-height: 100dvh;
		padding-top: var(--safe-top);
		padding-left: var(--safe-left);
		padding-right: var(--safe-right);
		display: flex;
		flex-direction: column;
	}
	.tabs {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		gap: var(--space-5);
		padding: 10px 0 max(var(--safe-bottom), 10px);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-top: 1px solid var(--hairline);
	}
	.tabs a {
		color: var(--ink-faint);
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		padding: 8px 10px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.tabs a.active {
		color: var(--gold);
	}
	.tabs a:hover {
		text-decoration: none;
		color: var(--ink-muted);
	}
</style>
