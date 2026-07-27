<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/en';
	import { ONTOLOGY_DIMS, ONTOLOGY_GROUPS } from '$lib/engine/ontology';
	import { buildProfile, type TasteProfile } from '$lib/engine/profile';
	import { app, type TimelineSnapshot } from '$lib/state/app.svelte';

	let timeline = $state<TimelineSnapshot[]>([]);

	onMount(async () => {
		await app.init();
		timeline = await app.timeline();
	});

	const profile = $derived.by((): TasteProfile | null => {
		if (!app.model || app.catalog.status !== 'ready') return null;
		return buildProfile(app.model, app.events, (id) => app.work(id), ONTOLOGY_DIMS);
	});

	const TIER_LABEL: Record<string, string> = {
		strong: t.profile.tierStrong,
		moderate: t.profile.tierModerate,
		weak: t.profile.tierWeak,
		insufficient: t.profile.tierInsufficient
	};

	function groupLabel(id: string): string {
		return ONTOLOGY_GROUPS.get(id) ?? id;
	}

	/** Bar width from |z|, capped — a relative visual cue, not a percentage. */
	function barWidth(z: number): string {
		return `${Math.min(100, Math.round((z / 3) * 100))}%`;
	}
</script>

<svelte:head>
	<title>{t.profile.title} — Beholder</title>
</svelte:head>

<main class="page">
	<h1>{t.profile.title}</h1>

	{#if !profile}
		<p class="hint">{t.home.catalogLoading}</p>
	{:else if profile.totalChoices === 0}
		<p class="hint">{t.profile.empty}</p>
	{:else}
		<section class="reading">
			{#each profile.interpretation as line, i (i)}
				<p class="interp">{line}</p>
			{/each}
			<p class="hint">
				{t.profile.basis(profile.totalChoices)}
			</p>
		</section>

		{#if profile.affinities.length > 0}
			<section>
				<h2>{t.profile.drawsYou}</h2>
				<ul class="dims">
					{#each profile.affinities.slice(0, 10) as e (e.dim)}
						<li>
							<div class="dim-head">
								<span class="dim-label">
									{e.label}
									{#if e.provisional}<span class="badge provisional">{t.profile.provisional}</span
										>{/if}
								</span>
								<span class="badge {e.tier}">{TIER_LABEL[e.tier]}</span>
							</div>
							<div class="bar-track" aria-hidden="true">
								<div class="bar positive" style:width={barWidth(e.z)}></div>
							</div>
							<span class="dim-group">{groupLabel(e.group)} · {t.profile.observations(e.n)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if profile.aversions.length > 0}
			<section>
				<h2>{t.profile.leavesYou}</h2>
				<ul class="dims">
					{#each profile.aversions.slice(0, 6) as e (e.dim)}
						<li>
							<div class="dim-head">
								<span class="dim-label">
									{e.label}
									{#if e.provisional}<span class="badge provisional">{t.profile.provisional}</span
										>{/if}
								</span>
								<span class="badge {e.tier}">{TIER_LABEL[e.tier]}</span>
							</div>
							<div class="bar-track" aria-hidden="true">
								<div class="bar negative" style:width={barWidth(e.z)}></div>
							</div>
							<span class="dim-group">{groupLabel(e.group)} · {t.profile.observations(e.n)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if profile.conflicts.length > 0}
			<section>
				<h2>{t.profile.contradictions}</h2>
				<ul class="plain">
					{#each profile.conflicts as e (e.dim)}
						<li>{t.profile.conflictLine(e.label)}</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if profile.uncertain.length > 0}
			<section>
				<h2>{t.profile.stillOpen}</h2>
				<ul class="chips-list">
					{#each profile.uncertain as e (e.dim)}
						<li class="chip-static">{e.label}</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if profile.artists.length > 0}
			<section>
				<h2>{t.profile.artists}</h2>
				<ul class="plain">
					{#each profile.artists.slice(0, 12) as a (a.name)}
						<li class="artist-row">
							<span
								>{a.name}{#if a.seeded}<span class="badge provisional">{t.profile.seeded}</span
									>{/if}</span
							>
							<span class="dim-group">
								{#if a.wins + a.losses > 0}
									{t.profile.artistRecord(a.wins, a.losses, a.saves)}
								{:else}
									{t.profile.noObservations}
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if timeline.length >= 2}
			<section>
				<h2>{t.profile.evolution}</h2>
				<ul class="plain">
					{#each timeline.slice(-6).reverse() as snap (snap.at)}
						<li class="timeline-row">
							<span class="dim-group"
								>{new Date(snap.at).toLocaleDateString()} · {t.profile.afterChoices(
									snap.choices
								)}</span
							>
							<span>
								{snap.top
									.slice(0, 3)
									.map((d) => ONTOLOGY_DIMS.find((o) => o.id === d.dim)?.label ?? d.dim)
									.join(' · ')}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<p class="hint">{t.profile.honesty}</p>
	{/if}
</main>

<style>
	.page {
		flex: 1;
		padding: var(--space-4) var(--space-3) calc(80px + var(--safe-bottom));
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-size: 1.7rem;
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: 1.05rem;
		margin: 0 0 var(--space-3);
		color: var(--ink);
	}
	section {
		border-top: 1px solid var(--hairline);
		padding: var(--space-4) 0;
	}
	.reading {
		border-top: none;
		padding-top: 0;
	}
	.interp {
		font-family: var(--font-display);
		font-size: 1.08rem;
		line-height: 1.55;
		margin: 0 0 var(--space-3);
	}
	.hint {
		color: var(--ink-faint);
		font-size: 0.8rem;
	}
	.dims {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.dim-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-2);
	}
	.dim-label {
		font-weight: 500;
	}
	.badge {
		font-size: 0.66rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.badge.strong {
		border-color: var(--gold);
		color: var(--gold);
	}
	.badge.moderate {
		border-color: var(--gold-deep);
		color: var(--gold-deep);
	}
	.badge.provisional {
		font-style: italic;
		margin-left: 6px;
	}
	.bar-track {
		height: 3px;
		background: var(--hairline);
		border-radius: 2px;
		margin: 8px 0 4px;
	}
	.bar {
		height: 100%;
		border-radius: 2px;
	}
	.bar.positive {
		background: var(--gold);
	}
	.bar.negative {
		background: var(--ink-faint);
	}
	.dim-group {
		color: var(--ink-faint);
		font-size: 0.72rem;
	}
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--ink-muted);
		font-size: 0.92rem;
	}
	.artist-row,
	.timeline-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.chips-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip-static {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.8rem;
		color: var(--ink-muted);
	}
</style>
