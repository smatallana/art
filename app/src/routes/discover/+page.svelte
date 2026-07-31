<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import WorkCard from '$lib/components/WorkCard.svelte';
	import {
		applyFilter,
		exploreFilters,
		hasEstablishedRead,
		recommendChallenge,
		recommendClose,
		searchWorks,
		shuffledForDisplay,
		suggestArtists,
		surpriseMe,
		type ExploreFilter,
		type Recommendation
	} from '$lib/engine/discover';
	import { ONTOLOGY_DIMS } from '$lib/engine/ontology';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';

	let query = $state('');
	let activeFilter = $state<ExploreFilter | null>(null);
	let surpriseId = $state<string | null>(null);

	onMount(() => void app.init());

	const ontologyMap = new Map(ONTOLOGY_DIMS.map((d) => [d.id, d]));
	const ready = $derived(app.catalog.works.length > 0 && app.model != null);
	const established = $derived(app.model != null && hasEstablishedRead(app.model));

	const close = $derived.by((): Recommendation[] =>
		ready
			? recommendClose(
					app.model!,
					app.catalog.works,
					app.events,
					ontologyMap,
					(id) => app.work(id),
					12
				)
			: []
	);
	const challenge = $derived.by((): Recommendation[] =>
		ready ? recommendChallenge(app.model!, app.catalog.works, app.events, ontologyMap, 8) : []
	);
	const artists = $derived.by(() =>
		ready ? suggestArtists(app.model!, app.catalog.works, app.events, 8) : []
	);
	const filters = $derived(ready ? exploreFilters(app.catalog.works) : []);
	const searchHits = $derived(
		ready && query.length >= 2 ? searchWorks(app.catalog.works, query) : []
	);
	const filtered = $derived.by(() => {
		if (!ready || !activeFilter) return [];
		const day = Math.floor(Date.now() / 86400000);
		return shuffledForDisplay(applyFilter(app.catalog.works, activeFilter), day).slice(0, 60);
	});

	function surprise(): void {
		if (!ready) return;
		const w = surpriseMe(app.model!, app.catalog.works, app.events, Date.now() % 100000);
		if (w) surpriseId = w.id;
	}

	$effect(() => {
		if (surpriseId) {
			location.href = `${base}/work/${surpriseId}/`;
		}
	});
</script>

<svelte:head>
	<title>{t.discover.title} — Beholder</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1>{t.discover.title}</h1>
		<input
			class="search"
			type="search"
			placeholder={t.discover.searchPlaceholder}
			bind:value={query}
			aria-label={t.discover.searchPlaceholder}
		/>
		<a class="snap-link" href={`${base}/snap/`}>{t.snap.title} ↗</a>
	</header>

	{#if !ready}
		<p class="hint">{t.home.catalogLoading}</p>
	{:else if query.length >= 2}
		<section>
			<h2>{t.discover.results(searchHits.length)}</h2>
			<div class="grid">
				{#each searchHits as w (w.id)}
					<WorkCard work={w} />
				{/each}
			</div>
		</section>
	{:else if activeFilter}
		<section>
			<div class="filter-head">
				<h2>{activeFilter.label} · {activeFilter.count}</h2>
				<button class="chip" onclick={() => (activeFilter = null)}>{t.discover.clear}</button>
			</div>
			<div class="grid">
				{#each filtered as w (w.id)}
					<WorkCard work={w} />
				{/each}
			</div>
		</section>
	{:else}
		{#if app.totalChoices >= 5}
			<section>
				<!-- Honest heading: "For your eye" only once real evidence exists;
				     until then these are stated as early possibilities. -->
				<h2>{established ? t.discover.close : t.discover.closeEarly}</h2>
				<p class="hint">{established ? t.discover.closeHint : t.discover.closeEarlyHint}</p>
				<div class="row">
					{#each close as r (r.work.id)}
						<WorkCard work={r.work} why={r.why} />
					{/each}
				</div>
			</section>

			<section>
				<h2>{t.discover.challenge}</h2>
				<p class="hint">{t.discover.challengeHint}</p>
				<div class="row">
					{#each challenge as r (r.work.id)}
						<WorkCard work={r.work} why={r.why} />
					{/each}
				</div>
			</section>
		{:else}
			<p class="hint">{t.discover.needSessions}</p>
		{/if}

		<section class="surprise-wrap">
			<button class="surprise" onclick={surprise}>{t.discover.surprise}</button>
		</section>

		{#if artists.length > 0}
			<section>
				<h2>{t.discover.artists}</h2>
				<p class="hint">{t.discover.artistsHint}</p>
				{#each artists.slice(0, 5) as a (a.name)}
					<div class="artist">
						<h3>{a.name}</h3>
						<div class="row">
							{#each a.sampleWorks as w (w.id)}
								<WorkCard work={w} />
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<section>
			<h2>{t.discover.explore}</h2>
			<div class="chips">
				{#each filters as f (f.kind + f.id)}
					<button class="chip" onclick={() => (activeFilter = f)}>
						{f.label} <span class="count">{f.count}</span>
					</button>
				{/each}
			</div>
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
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	h1 {
		font-size: 1.7rem;
	}
	.search {
		flex: 1;
		min-width: 200px;
		background: var(--surface);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 10px 18px;
		color: var(--ink);
		font-size: 0.95rem;
	}
	.search:focus {
		outline: none;
		border-color: var(--gold-deep);
	}
	.snap-link {
		color: var(--gold);
		font-size: 0.9rem;
		white-space: nowrap;
	}
	section {
		margin-bottom: var(--space-5);
	}
	h2 {
		font-size: 1.1rem;
		margin-bottom: var(--space-1);
	}
	.hint {
		color: var(--ink-faint);
		font-size: 0.8rem;
		margin: 0 0 var(--space-3);
	}
	.row {
		display: flex;
		gap: var(--space-3);
		overflow-x: auto;
		padding-bottom: var(--space-2);
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-4);
	}
	.grid :global(.card) {
		width: auto;
	}
	.filter-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-3);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 0.85rem;
		color: var(--ink-muted);
		min-height: 44px;
	}
	.chip:hover {
		border-color: var(--gold-deep);
		color: var(--ink);
	}
	.count {
		color: var(--ink-faint);
		font-size: 0.72rem;
	}
	.artist {
		margin-bottom: var(--space-4);
	}
	.artist h3 {
		font-size: 0.95rem;
		margin-bottom: var(--space-2);
	}
	.surprise-wrap {
		display: flex;
		justify-content: center;
	}
	.surprise {
		border: 1px solid var(--gold);
		color: var(--gold);
		border-radius: 999px;
		padding: 14px 36px;
		font-size: 1rem;
		min-height: 48px;
	}
	.surprise:hover {
		background: color-mix(in srgb, var(--gold) 12%, transparent);
	}
</style>
