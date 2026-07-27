<script lang="ts">
	import { onMount } from 'svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';

	onMount(() => void app.init());

	const savedWorks = $derived([...app.savedIds].map((id) => app.work(id)).filter((w) => w != null));
</script>

<svelte:head>
	<title>{t.saved.title} — Beholder</title>
</svelte:head>

<main class="page">
	<h1>{t.saved.title}</h1>
	{#if savedWorks.length === 0}
		<p class="empty">{t.saved.empty}</p>
	{:else}
		<ul class="grid">
			{#each savedWorks as work (work.id)}
				<li>
					<div class="thumb"><ArtworkImage {work} size="thumb" /></div>
					<h2>{work.title}</h2>
					<p class="meta">{work.artist.name} · {work.date.display}</p>
					<div class="row">
						<a class="chip" href={work.museum.url} target="_blank" rel="noopener">
							{t.reveal.viewAtMuseum}
						</a>
						<button class="chip" onclick={() => app.record({ t: 'unsave', work: work.id })}>
							{t.saved.remove}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		flex: 1;
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 1100px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-size: 1.7rem;
		margin-bottom: var(--space-4);
	}
	.empty {
		color: var(--ink-muted);
		max-width: 40ch;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
	}
	.thumb {
		margin-bottom: var(--space-2);
	}
	h2 {
		font-size: 1.05rem;
		line-height: 1.25;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.8rem;
		margin: var(--space-1) 0 var(--space-2);
	}
	.row {
		display: flex;
		gap: var(--space-2);
	}
	.chip {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.78rem;
		color: var(--ink-muted);
	}
</style>
