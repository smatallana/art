<script lang="ts">
	import { onMount } from 'svelte';
	import BackBar from '$lib/components/BackBar.svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import { t } from '$lib/i18n';
	import { savePhoto } from '$lib/db';
	import {
		CONFIDENT_MATCH,
		PLAUSIBLE_MATCH,
		embedPhoto,
		loadCatalogEmbeddings,
		topMatches,
		type SnapMatch
	} from '$lib/snap';
	import { app } from '$lib/state/app.svelte';

	let phase = $state<'pick' | 'working' | 'choose' | 'confirmed' | 'archived' | 'unavailable'>(
		'pick'
	);
	let progress = $state('');
	let previewUrl = $state<string | null>(null);
	let matches = $state<SnapMatch[]>([]);
	let confirmedId = $state<string | null>(null);
	let photoBlob: Blob | null = null;

	onMount(() => void app.init());

	async function onFile(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		photoBlob = file;
		previewUrl = URL.createObjectURL(file);
		phase = 'working';
		progress = t.snap.loadingCatalog;
		try {
			const catalog = await loadCatalogEmbeddings();
			if (!catalog) {
				phase = 'unavailable';
				return;
			}
			const vec = await embedPhoto(file, (m) => {
				progress =
					m === 'downloading model'
						? t.snap.loadingModel
						: m === 'encoding'
							? t.snap.matching
							: progress;
			});
			matches = topMatches(vec, catalog, 3).filter((m) => m.similarity >= PLAUSIBLE_MATCH);
			phase = 'choose';
		} catch (err) {
			console.warn('snap failed', err);
			phase = 'unavailable';
		}
	}

	async function confirm(workId: string): Promise<void> {
		const work = app.work(workId);
		await app.record({ t: 'photo_capture', work: workId });
		await app.record({ t: 'seen_in_person', work: workId, museum: work?.museum.name ?? null });
		await app.record({ t: 'rating', work: workId, value: 5 });
		if (!app.savedIds.has(workId)) await app.record({ t: 'save', work: workId });
		confirmedId = workId;
		phase = 'confirmed';
	}

	async function archive(): Promise<void> {
		const event = await app.record({ t: 'photo_capture', work: null });
		if (photoBlob) await savePhoto(event.id, photoBlob);
		phase = 'archived';
	}

	function reset(): void {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		matches = [];
		confirmedId = null;
		photoBlob = null;
		phase = 'pick';
	}
</script>

<svelte:head>
	<title>{t.snap.title} — Beholder</title>
</svelte:head>

<main class="page">
	<BackBar fallback="/discover/" />
	<h1>{t.snap.title}</h1>

	{#if phase === 'pick'}
		<p class="hint">{t.snap.intro}</p>
		<label class="picker">
			<input type="file" accept="image/*" capture="environment" onchange={onFile} />
			<span class="primary">{t.snap.takePhoto}</span>
		</label>
		<p class="hint small">{t.snap.privacy}</p>
	{:else if phase === 'working'}
		{#if previewUrl}<img class="preview" src={previewUrl} alt="" />{/if}
		<p class="hint" role="status">{progress}</p>
		<p class="hint small">{t.snap.firstTime}</p>
	{:else if phase === 'choose'}
		{#if previewUrl}<img class="preview small-preview" src={previewUrl} alt="" />{/if}
		{#if matches.length > 0}
			<h2>{t.snap.isItOne}</h2>
			<div class="candidates">
				{#each matches as m (m.workId)}
					{@const work = app.work(m.workId)}
					{#if work}
						<div class="candidate">
							<ArtworkImage {work} size="thumb" />
							<p class="cand-title">{work.title}</p>
							<p class="cand-meta">{work.artist.name}</p>
							<p class="cand-meta faint">
								{m.similarity >= CONFIDENT_MATCH ? t.snap.likely : t.snap.maybe}
							</p>
							<button class="chip" onclick={() => confirm(m.workId)}>{t.snap.itsThis}</button>
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="hint">{t.snap.noCandidates}</p>
		{/if}
		<button class="chip ghost" onclick={archive}>{t.snap.noneOfThese}</button>
	{:else if phase === 'confirmed'}
		{#if confirmedId}
			{@const work = app.work(confirmedId)}
			{#if work}
				<div class="confirm-art"><ArtworkImage {work} /></div>
				<h2>{work.title}</h2>
				<p class="hint">{t.snap.confirmedNote(work.artist.name)}</p>
			{/if}
		{/if}
		<button class="primary" onclick={reset}>{t.snap.another}</button>
	{:else if phase === 'archived'}
		<p class="hint">{t.snap.archivedNote}</p>
		<button class="primary" onclick={reset}>{t.snap.another}</button>
	{:else}
		<p class="hint">{t.snap.unavailable}</p>
		<button class="primary" onclick={reset}>{t.snap.back}</button>
	{/if}
</main>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 760px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-size: 1.7rem;
	}
	h2 {
		font-size: 1.15rem;
	}
	.hint {
		color: var(--ink-muted);
		font-size: 0.92rem;
		max-width: 44ch;
	}
	.hint.small,
	.faint {
		color: var(--ink-faint);
		font-size: 0.75rem;
	}
	.picker input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 14px 36px;
		min-height: 48px;
		cursor: pointer;
	}
	.preview {
		max-width: min(100%, 420px);
		max-height: 38dvh;
		border-radius: 6px;
		box-shadow: var(--shadow-work);
	}
	.small-preview {
		max-height: 20dvh;
	}
	.candidates {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		justify-content: center;
	}
	.candidate {
		width: 168px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cand-title {
		font-size: 0.82rem;
		line-height: 1.25;
	}
	.cand-meta {
		color: var(--ink-muted);
		font-size: 0.74rem;
	}
	.chip {
		border: 1px solid var(--gold-deep);
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 0.82rem;
		color: var(--ink);
		min-height: 40px;
	}
	.chip.ghost {
		border-color: var(--hairline);
		color: var(--ink-muted);
		margin-top: var(--space-2);
	}
	.confirm-art {
		max-height: 44dvh;
		display: flex;
		justify-content: center;
		width: 100%;
	}
</style>
