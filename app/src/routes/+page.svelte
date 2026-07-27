<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';
	import { dueItems } from '$lib/engine/memory';

	onMount(() => void app.init());

	const memoryDue = $derived(app.catalog.status === 'ready' ? dueItems(app.events).length : 0);
</script>

<svelte:head>
	<title>Beholder</title>
</svelte:head>

<main class="hall">
	<div class="mark" aria-hidden="true">
		<svg viewBox="0 0 96 48" width="84" height="42" role="img">
			<path
				d="M4 24 C 20 4, 76 4, 92 24 C 76 44, 20 44, 4 24 Z"
				fill="none"
				stroke="var(--gold)"
				stroke-width="2.5"
			/>
			<circle cx="48" cy="24" r="9.5" fill="none" stroke="var(--gold)" stroke-width="2.5" />
			<circle cx="48" cy="24" r="3" fill="var(--gold)" />
		</svg>
	</div>
	<h1>{t.appName}</h1>
	<p class="tagline">{t.tagline}</p>

	{#if app.catalog.status === 'loading' || app.catalog.status === 'idle'}
		<p class="status">{t.home.catalogLoading}</p>
	{:else if app.catalog.status === 'error'}
		<p class="status error">{t.home.catalogError}</p>
	{:else}
		{#if app.catalog.fromCache && app.catalog.error}
			<p class="status">{t.home.catalogOffline}</p>
		{/if}
		<a class="start" href={`${base}/session/`} data-sveltekit-preload-data="tap">
			{app.engine && app.engine.state.phase !== 'done' ? t.home.continue : t.home.start}
		</a>
		{#if memoryDue > 0}
			<a class="memory-cta" href={`${base}/remember/`}>{t.memory.dueCount(memoryDue)} →</a>
		{/if}
		{#if app.totalChoices > 0}
			<p class="stats">
				{t.home.sessionsDone(app.totalSessions)} · {t.home.answersLogged(app.totalChoices)}
			</p>
		{/if}
	{/if}
</main>

<style>
	.hall {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: var(--space-2);
		padding: var(--space-5) var(--space-4);
	}
	.mark {
		opacity: 0.9;
		margin-bottom: var(--space-2);
	}
	h1 {
		font-size: clamp(2.6rem, 9vw, 4rem);
	}
	.tagline {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--ink-muted);
		font-size: 1.15rem;
		margin: 0 0 var(--space-4);
	}
	.status {
		color: var(--ink-faint);
		font-size: 0.9rem;
	}
	.status.error {
		color: var(--ink-muted);
		max-width: 34ch;
	}
	.start {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 16px 44px;
		font-size: 1.05rem;
		min-height: 52px;
		text-decoration: none;
	}
	.start:hover {
		text-decoration: none;
		filter: brightness(1.06);
	}
	.memory-cta {
		color: var(--gold-deep);
		font-size: 0.9rem;
		margin-top: var(--space-2);
	}
	.stats {
		color: var(--ink-faint);
		font-size: 0.8rem;
		margin-top: var(--space-3);
	}
</style>
