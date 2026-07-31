<script lang="ts">
	import { onMount } from 'svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import WorkCard from '$lib/components/WorkCard.svelte';
	import { dueItems, knownItems, memoryItems } from '$lib/engine/memory';
	import { t } from '$lib/i18n';
	import { app } from '$lib/state/app.svelte';

	let revealed = $state(false);

	onMount(() => void app.init());

	const ready = $derived(app.catalog.works.length > 0);
	const due = $derived(ready ? dueItems(app.events) : []);
	const current = $derived(due.length > 0 ? app.work(due[0]!.work) : undefined);
	const known = $derived.by(() =>
		ready
			? knownItems(app.events)
					.map((i) => app.work(i.work))
					.filter((w) => w != null)
			: []
	);
	const totalTracked = $derived(ready ? memoryItems(app.events).length : 0);

	async function grade(outcome: 'recognized' | 'partial' | 'missed'): Promise<void> {
		if (!current) return;
		await app.record({ t: 'memory_review', work: current.id, outcome });
		revealed = false;
	}
</script>

<svelte:head>
	<title>{t.memory.title} — Beholder</title>
</svelte:head>

<main class="page">
	<h1>{t.memory.title}</h1>

	{#if !ready}
		<p class="hint">{t.home.catalogLoading}</p>
	{:else if totalTracked === 0}
		<p class="hint">{t.memory.empty}</p>
	{:else}
		{#if current}
			<section class="quiz">
				<p class="hint">{t.memory.dueCount(due.length)}</p>
				<div class="art"><ArtworkImage work={current} /></div>
				{#if !revealed}
					<p class="prompt">{t.memory.prompt}</p>
					<button class="primary" onclick={() => (revealed = true)}>{t.memory.reveal}</button>
				{:else}
					<div class="answer">
						<h2>{current.title}</h2>
						<p class="meta">
							{current.artist.name} · {current.date.display} · {current.museum.name}
						</p>
						{#if current.story}
							<p class="story">{current.story}</p>
						{/if}
					</div>
					<p class="prompt">{t.memory.gradePrompt}</p>
					<div class="grades">
						<button class="chip" onclick={() => grade('recognized')}>{t.memory.knewIt}</button>
						<button class="chip" onclick={() => grade('partial')}>{t.memory.almost}</button>
						<button class="chip" onclick={() => grade('missed')}>{t.memory.notYet}</button>
					</div>
				{/if}
			</section>
		{:else}
			<p class="hint">{t.memory.allDone}</p>
		{/if}

		{#if known.length > 0}
			<section>
				<h2 class="section-title">{t.memory.knownTitle(known.length)}</h2>
				<div class="row">
					{#each known as w (w.id)}
						<WorkCard work={w} />
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	.page {
		flex: 1;
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 760px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-size: 1.7rem;
		margin-bottom: var(--space-3);
	}
	.hint {
		color: var(--ink-faint);
		font-size: 0.85rem;
	}
	.quiz {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}
	.art {
		width: 100%;
		max-height: 48dvh;
		display: flex;
		justify-content: center;
	}
	.prompt {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--ink-muted);
	}
	.primary {
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 14px 40px;
		min-height: 48px;
	}
	.answer {
		text-align: center;
	}
	.answer h2 {
		font-size: 1.3rem;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.85rem;
		margin-top: var(--space-1);
	}
	.story {
		font-family: var(--font-display);
		font-size: 0.95rem;
		margin-top: var(--space-2);
		color: var(--ink);
	}
	.grades {
		display: flex;
		gap: var(--space-2);
	}
	.chip {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 10px 18px;
		font-size: 0.9rem;
		color: var(--ink-muted);
		min-height: 44px;
	}
	.chip:hover {
		border-color: var(--gold-deep);
		color: var(--ink);
	}
	.section-title {
		font-size: 1.05rem;
		margin-bottom: var(--space-3);
	}
	.row {
		display: flex;
		gap: var(--space-3);
		overflow-x: auto;
		padding-bottom: var(--space-2);
	}
</style>
