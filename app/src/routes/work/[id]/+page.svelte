<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import BackBar from '$lib/components/BackBar.svelte';
	import { contributions } from '$lib/engine/discover';
	import { ONTOLOGY_DIMS } from '$lib/engine/ontology';
	import { t } from '$lib/i18n';
	import { app } from '$lib/state/app.svelte';

	let fullscreen = $state(false);
	let noteDraft = $state('');
	let noteSaved = $state(false);

	onMount(() => void app.init());

	const ontologyMap = new Map(ONTOLOGY_DIMS.map((d) => [d.id, d]));
	const work = $derived(app.work(page.params.id ?? ''));
	const why = $derived.by(() => {
		if (!work || !app.model || app.totalChoices < 5) return [];
		return contributions(app.model, work, ontologyMap)
			.filter((c) => c.value > 0)
			.slice(0, 3);
	});
	const seenInPerson = $derived(
		work ? app.events.some((e) => e.t === 'seen_in_person' && e.work === work.id) : false
	);
	const notes = $derived(
		work
			? app.events.filter(
					(e): e is Extract<typeof e, { t: 'note' }> => e.t === 'note' && e.work === work.id
				)
			: []
	);

	async function toggleSave(): Promise<void> {
		if (!work) return;
		if (app.savedIds.has(work.id)) await app.record({ t: 'unsave', work: work.id });
		else await app.record({ t: 'save', work: work.id });
	}
	async function remember(): Promise<void> {
		if (!work || app.rememberedIds.has(work.id)) return;
		await app.record({ t: 'remember', work: work.id });
	}
	async function markSeen(): Promise<void> {
		if (!work || seenInPerson) return;
		await app.record({ t: 'seen_in_person', work: work.id, museum: work.museum.name });
	}
	async function saveNote(): Promise<void> {
		if (!work || noteDraft.trim().length === 0) return;
		await app.record({ t: 'note', work: work.id, text: noteDraft.trim() });
		noteDraft = '';
		noteSaved = true;
		setTimeout(() => (noteSaved = false), 2000);
	}
</script>

<svelte:head>
	<title>{work ? work.title : 'Work'} — Beholder</title>
</svelte:head>

{#if work}
	<main class="page">
		<BackBar fallback="/discover/" />
		<button class="art" onclick={() => (fullscreen = true)} aria-label={t.work.viewFull}>
			<ArtworkImage {work} />
		</button>

		<h1>{work.title}</h1>
		<p class="meta">
			{work.artist.name}{work.artist.born
				? ` (${work.artist.born}–${work.artist.died ?? '?'})`
				: ''}
			· {work.date.display}
		</p>
		<p class="meta">
			{work.medium ?? ''}{work.medium && work.dimensions ? ' · ' : ''}{work.dimensions ?? ''}
		</p>
		<p class="meta museum">{work.museum.name}</p>
		{#if work.story}
			<p class="story">{work.story}</p>
		{/if}

		{#if why.length > 0}
			<section class="block">
				<h2>{t.work.whyTitle}</h2>
				<p class="why">{why.map((c) => c.label).join(' · ')}</p>
			</section>
		{/if}

		<div class="actions">
			<button class="chip" onclick={toggleSave}>
				{app.savedIds.has(work.id) ? t.session.saved : t.session.save}
			</button>
			<button class="chip" onclick={remember}>
				{app.rememberedIds.has(work.id) ? t.session.remembered : t.session.remember}
			</button>
			<button class="chip" class:on={seenInPerson} onclick={markSeen}>
				{seenInPerson ? t.work.seenInPersonDone : t.work.seenInPerson}
			</button>
			<a class="chip" href={work.museum.url} target="_blank" rel="noopener">
				{t.reveal.viewAtMuseum}
			</a>
		</div>

		<section class="block">
			<h2>{t.work.notes}</h2>
			{#each notes as n (n.id)}
				<p class="note">{n.text}</p>
			{/each}
			<textarea
				rows="2"
				placeholder={t.work.notePlaceholder}
				bind:value={noteDraft}
				aria-label={t.work.notes}
			></textarea>
			<div class="row">
				<button class="chip" onclick={saveNote} disabled={noteDraft.trim().length === 0}>
					{noteSaved ? t.work.noteSaved : t.work.noteSave}
				</button>
			</div>
		</section>

		<p class="attribution">{work.rights.attribution}</p>
	</main>

	{#if fullscreen}
		<button class="fullscreen" onclick={() => (fullscreen = false)} aria-label={t.work.closeFull}>
			<img src={work.images.full ?? work.images.display} alt={work.title} />
		</button>
	{/if}
{:else if app.catalog.works.length > 0 && app.catalog.status !== 'loading' && app.catalog.status !== 'partial'}
	<main class="page"><p class="meta">{t.work.notFound}</p></main>
{:else}
	<main class="page"><p class="meta">{t.home.catalogLoading}</p></main>
{/if}

<style>
	.page {
		flex: 1;
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 760px;
		margin: 0 auto;
		width: 100%;
	}
	.art {
		display: block;
		width: 100%;
		margin-bottom: var(--space-4);
		cursor: zoom-in;
	}
	h1 {
		font-size: 1.5rem;
		line-height: 1.25;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.88rem;
		margin: var(--space-1) 0 0;
	}
	.museum {
		color: var(--gold-deep);
	}
	.story {
		font-family: var(--font-display);
		font-size: 1.02rem;
		line-height: 1.55;
		margin: var(--space-3) 0 0;
	}
	.block {
		border-top: 1px solid var(--hairline);
		margin-top: var(--space-4);
		padding-top: var(--space-3);
	}
	.block h2 {
		font-size: 0.95rem;
		margin-bottom: var(--space-2);
	}
	.why {
		color: var(--gold-deep);
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.chip {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 10px 16px;
		font-size: 0.85rem;
		color: var(--ink-muted);
		min-height: 42px;
		display: inline-flex;
		align-items: center;
	}
	.chip.on {
		border-color: var(--gold-deep);
		color: var(--ink);
	}
	.chip:disabled {
		opacity: 0.4;
	}
	a.chip:hover {
		text-decoration: none;
	}
	.note {
		color: var(--ink);
		font-size: 0.92rem;
		border-left: 2px solid var(--gold-deep);
		padding-left: var(--space-3);
		margin: var(--space-2) 0;
	}
	textarea {
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		color: var(--ink);
		padding: 10px 14px;
		font: inherit;
		font-size: 0.92rem;
		resize: vertical;
		margin-top: var(--space-2);
	}
	textarea:focus {
		outline: none;
		border-color: var(--gold-deep);
	}
	.row {
		margin-top: var(--space-2);
	}
	.attribution {
		color: var(--ink-faint);
		font-size: 0.7rem;
		margin-top: var(--space-5);
	}
	.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: #000;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: zoom-out;
	}
	.fullscreen img {
		max-width: 100vw;
		max-height: 100vh;
		object-fit: contain;
	}
</style>
