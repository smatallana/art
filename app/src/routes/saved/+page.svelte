<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import { getPhoto } from '$lib/db';
	import { ERA_BUCKET_COUNT, eraCoverage, seenGallery } from '$lib/engine/gallery';
	import { t } from '$lib/i18n';
	import { app } from '$lib/state/app.svelte';

	/** Cap the rendered grid — the counter still tells the full story. */
	const SEEN_RENDER_CAP = 96;

	// Field notebook: Snap photos that matched nothing in the collection.
	// They live only in this device's IndexedDB (photo_capture, work: null).
	let notebook = $state<{ id: string; at: string; url: string }[]>([]);

	onMount(async () => {
		await app.init();
		const unmatched = app.events.filter((e) => e.t === 'photo_capture' && e.work === null);
		const out: { id: string; at: string; url: string }[] = [];
		for (const e of unmatched.slice(-24).reverse()) {
			const blob = await getPhoto(e.id);
			if (blob) out.push({ id: e.id, at: e.at, url: URL.createObjectURL(blob) });
		}
		notebook = out;
	});
	onDestroy(() => {
		for (const n of notebook) URL.revokeObjectURL(n.url);
	});

	const savedWorks = $derived([...app.savedIds].map((id) => app.work(id)).filter((w) => w != null));

	// The accumulated gallery: everything that has passed before this eye
	// (real-user finding: the app never showed what you had already seen).
	const seen = $derived(seenGallery(app.events));
	const seenEras = $derived(eraCoverage(seen, (id) => app.work(id)));
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

	{#if seen.length > 0}
		<section class="seen">
			<h2 class="seen-title">{t.saved.seenTitle}</h2>
			<p class="seen-hint">
				{t.saved.seenCount(seen.length, app.catalog.works.length)}
				{#if seenEras > 0}{t.saved.seenEras(seenEras, ERA_BUCKET_COUNT)}{/if}
				{#if seen.length > SEEN_RENDER_CAP}{t.saved.seenLatest}{/if}
			</p>
			<ul class="seen-grid">
				{#each seen.slice(0, SEEN_RENDER_CAP) as entry (entry.id)}
					{@const work = app.work(entry.id)}
					{#if work}
						<li>
							<a class="seen-item" href={`${base}/work/${entry.id}/`}>
								<ArtworkImage {work} size="thumb" />
								{#if entry.chosen}
									<span class="seen-mark">● {t.saved.seenChosen}</span>
								{/if}
							</a>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	{#if notebook.length > 0}
		<section class="notebook">
			<h2 class="nb-title">{t.saved.notebook}</h2>
			<p class="nb-hint">{t.saved.notebookHint}</p>
			<ul class="nb-grid">
				{#each notebook as n (n.id)}
					<li>
						<img class="nb-photo" src={n.url} alt={t.saved.notebookAlt} />
						<p class="meta">{new Date(n.at).toLocaleDateString()}</p>
					</li>
				{/each}
			</ul>
		</section>
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
	.seen {
		border-top: 1px solid var(--hairline);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
	}
	.seen-title {
		font-size: 1.2rem;
	}
	.seen-hint {
		color: var(--ink-faint);
		font-size: 0.82rem;
		margin: var(--space-1) 0 var(--space-3);
		max-width: 60ch;
	}
	.seen-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: var(--space-2);
	}
	.seen-item {
		display: block;
		position: relative;
	}
	.seen-mark {
		position: absolute;
		left: 4px;
		bottom: 4px;
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		color: var(--gold);
		background: color-mix(in srgb, var(--bg) 78%, transparent);
		border-radius: 999px;
		padding: 2px 7px;
	}
	.notebook {
		border-top: 1px solid var(--hairline);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
	}
	.nb-title {
		font-size: 1.2rem;
	}
	.nb-hint {
		color: var(--ink-faint);
		font-size: 0.82rem;
		margin: var(--space-1) 0 var(--space-3);
		max-width: 52ch;
	}
	.nb-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-3);
	}
	.nb-photo {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 4px;
		background: var(--surface);
	}
</style>
