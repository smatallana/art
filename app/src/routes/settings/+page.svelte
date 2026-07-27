<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { clearAllLocalData } from '$lib/db';
	import { APP_VERSION } from '$lib/version';

	onMount(() => void app.init());

	let resetDone = $state(false);

	async function exportData(): Promise<void> {
		const json = await app.exportData();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `beholder-export-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function resetLocal(): Promise<void> {
		if (!confirm(t.settings.resetConfirm)) return;
		await clearAllLocalData();
		app.events = [];
		app.engine = null;
		app.savedIds = new SvelteSet();
		app.rememberedIds = new SvelteSet();
		resetDone = true;
	}
</script>

<svelte:head>
	<title>{t.settings.title} — Beholder</title>
</svelte:head>

<main class="page">
	<h1>{t.settings.title}</h1>

	<section>
		<h2>{t.settings.data}</h2>
		<p class="hint">{t.settings.exportHint}</p>
		<div class="row">
			<button class="btn" onclick={exportData}>{t.settings.exportBtn}</button>
			<button class="btn danger" onclick={resetLocal}>{t.settings.resetBtn}</button>
		</div>
		{#if resetDone}
			<p class="hint">{t.settings.resetDone}</p>
		{/if}
		<p class="hint">{t.settings.privacy}</p>
	</section>

	<section>
		<h2>{t.settings.attributions}</h2>
		{#if app.catalog.index}
			<ul class="plain">
				{#each Object.entries(app.catalog.index.sources) as [id, s] (id)}
					<li>{s.attribution} — {s.count} works</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">—</p>
		{/if}
	</section>

	<section>
		<h2>{t.settings.about}</h2>
		<p class="hint">{t.settings.aboutBody}</p>
		<p class="hint">
			v{APP_VERSION} ·
			<a href="https://github.com/smatallana/art" rel="noopener">Source on GitHub</a>
		</p>
	</section>
</main>

<style>
	.page {
		flex: 1;
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 700px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-size: 1.7rem;
		margin-bottom: var(--space-4);
	}
	section {
		border-top: 1px solid var(--hairline);
		padding: var(--space-4) 0;
	}
	h2 {
		font-size: 1.1rem;
		margin-bottom: var(--space-2);
	}
	.hint {
		color: var(--ink-muted);
		font-size: 0.88rem;
		margin: var(--space-2) 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-3) 0;
	}
	.btn {
		border: 1px solid var(--gold-deep);
		color: var(--ink);
		border-radius: 999px;
		padding: 12px 20px;
		font-size: 0.9rem;
		min-height: 44px;
	}
	.btn.danger {
		border-color: var(--hairline);
		color: var(--ink-muted);
	}
	.plain {
		list-style: none;
		padding: 0;
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.88rem;
	}
	.plain li {
		padding: 4px 0;
	}
</style>
