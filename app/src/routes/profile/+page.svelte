<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import { t } from '$lib/i18n/en';
	import { dueItems } from '$lib/engine/memory';
	import { ONTOLOGY_DIMS, ONTOLOGY_GROUPS } from '$lib/engine/ontology';
	import {
		artistExposure,
		buildProfile,
		patternStatusNow,
		representativeWorks,
		type PatternStatus,
		type TasteProfile
	} from '$lib/engine/profile';
	import { sessionMode } from '$lib/engine/session';
	import { app, type TimelineSnapshot } from '$lib/state/app.svelte';

	let timeline = $state<TimelineSnapshot[]>([]);

	onMount(async () => {
		await app.init();
		timeline = await app.timeline();
	});

	const memoryDue = $derived(app.catalog.works.length > 0 ? dueItems(app.events).length : 0);

	const profile = $derived.by((): TasteProfile | null => {
		if (!app.model || app.catalog.works.length === 0) return null;
		return buildProfile(app.model, app.events, (id) => app.work(id), ONTOLOGY_DIMS);
	});

	const TIER_LABEL: Record<string, string> = {
		strong: t.profile.tierStrong,
		moderate: t.profile.tierModerate,
		weak: t.profile.tierWeak,
		insufficient: t.profile.tierInsufficient
	};

	// ---- Portrait lead (tramo 9): synthesis, works, one tension, one test --
	const repWorks = $derived(
		app.model ? representativeWorks(app.model, app.events, (id) => app.work(id)) : []
	);
	const portraitLine = $derived.by(() => {
		if (!profile || profile.totalChoices < 8) return null;
		const top = profile.affinities[0];
		if (!top) return null;
		return t.profile.portrait(
			top.label,
			TIER_LABEL[top.tier] ?? '',
			profile.aversions[0]?.label ?? null
		);
	});
	// Honesty gate: queuing a test only when the NEXT session can honor it.
	const canQueueTest = $derived(sessionMode(app.totalChoices) === 'daily');
	const testTargets = $derived.by(() => {
		if (!profile) return [];
		const pool = profile.uncertain.length > 0 ? profile.uncertain : profile.conflicts;
		return pool.slice(0, 2);
	});
	let queued = $state<string | null>(null);
	async function queueTest(dim: string, label: string): Promise<void> {
		await app.setNextObjective([dim], label);
		queued = dim;
	}

	const STATUS_LABEL: Record<PatternStatus, string> = {
		strengthened: t.profile.statusStrengthened,
		weakened: t.profile.statusWeakened,
		changed: t.profile.statusChanged,
		holds: t.profile.statusHolds,
		unresolved: t.profile.statusUnresolved
	};
	const pastSessions = $derived.by(() => {
		const out: { at: string; answered: number; headline: string; status: string | null }[] = [];
		for (let i = app.events.length - 1; i >= 0 && out.length < 10; i--) {
			const e = app.events[i];
			if (!e || e.t !== 'session_end') continue;
			const p = e.insights?.patterns[0];
			out.push({
				at: e.at,
				answered: e.answered,
				headline: p?.label ?? (e.insights ? t.profile.pastNoPattern : ''),
				status:
					p && app.model
						? STATUS_LABEL[patternStatusNow({ dim: p.dim, s: p.s, z: p.z }, app.model)]
						: null
			});
		}
		return out;
	});

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
	<header class="page-head">
		<h1>{t.profile.title}</h1>
		<a class="settings-link" href={`${base}/settings/`}>{t.nav.settings}</a>
	</header>
	{#if memoryDue > 0}
		<a class="memory-cta" href={`${base}/remember/`}>{t.memory.dueCount(memoryDue)} →</a>
	{/if}

	{#if !profile}
		<p class="hint">{t.home.catalogLoading}</p>
	{:else if profile.totalChoices === 0}
		<p class="hint">{t.profile.empty}</p>
	{:else}
		{#if portraitLine || repWorks.length > 0 || testTargets.length > 0}
			<section class="portrait">
				{#if portraitLine}
					<p class="portrait-lead">{portraitLine}</p>
				{/if}
				{#if repWorks.length > 0}
					<p class="hint">{t.profile.representative}</p>
					<div class="rep-row">
						{#each repWorks as w (w.id)}
							<a class="rep-item" href={`${base}/work/${w.id}/`}>
								<ArtworkImage work={w} size="thumb" />
							</a>
						{/each}
					</div>
				{/if}
				{#if profile.conflicts[0]}
					<p class="portrait-sub">{t.profile.conflictLine(profile.conflicts[0].label)}</p>
				{/if}
				{#if testTargets.length > 0}
					<div class="test-row">
						{#each testTargets as e (e.dim)}
							<span class="test-chip">
								{e.label}
								{#if canQueueTest}
									<button class="test-btn" onclick={() => void queueTest(e.dim, e.label)}>
										{queued === e.dim ? t.profile.testQueued : t.profile.testThis}
									</button>
								{/if}
							</span>
						{/each}
					</div>
					{#if !canQueueTest}
						<p class="hint">{t.profile.testLater}</p>
					{/if}
				{/if}
			</section>
		{/if}

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
						{@const exposure = artistExposure(a)}
						<li class="artist-row">
							<span>
								{a.name}
								{#if a.seeded}<span class="badge provisional">{t.profile.seeded}</span>{/if}
								{#if exposure !== 'insufficient'}
									<span class="badge">
										{exposure === 'well-tested' ? t.profile.wellTested : t.profile.lightlyTested}
									</span>
								{/if}
							</span>
							<span class="dim-group">
								{#if exposure === 'insufficient'}
									<!-- Low exposure must never read as low affinity. -->
									{t.profile.artistLowExposure}
								{:else}
									{t.profile.artistRecord(a.wins, a.losses, a.saves)}
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if pastSessions.length > 0}
			<section>
				<details>
					<summary class="past-summary">{t.profile.pastSessions}</summary>
					<ul class="plain past-list">
						{#each pastSessions as s (s.at)}
							<li class="timeline-row">
								<span class="dim-group">
									{new Date(s.at).toLocaleDateString()} · {t.profile.pastFacts(s.answered)}
								</span>
								<span>
									{s.headline}{#if s.status}<span class="dim-group"> · {s.status}</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				</details>
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
	.page-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.settings-link {
		color: var(--ink-faint);
		font-size: 0.85rem;
	}
	.memory-cta {
		display: inline-block;
		color: var(--gold-deep);
		font-size: 0.9rem;
		margin-bottom: var(--space-2);
	}

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
	.portrait {
		border-top: none;
		padding-top: 0;
	}
	.portrait-lead {
		font-family: var(--font-display);
		font-size: 1.25rem;
		line-height: 1.5;
		margin: 0 0 var(--space-3);
	}
	.portrait-sub {
		color: var(--ink-muted);
		font-size: 0.9rem;
		margin: var(--space-3) 0 0;
	}
	.rep-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.rep-item {
		flex: 1 1 0;
		min-width: 0;
		max-width: 33%;
	}
	.test-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.test-chip {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 6px 8px 6px 14px;
		font-size: 0.85rem;
		color: var(--ink-muted);
	}
	.test-btn {
		border: 1px solid var(--gold-deep);
		color: var(--gold-deep);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.78rem;
		min-height: 32px;
		cursor: pointer;
	}
	.past-summary {
		font-size: 1.05rem;
		color: var(--ink);
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.past-list {
		margin-top: var(--space-3);
	}
	.reading {
		padding-top: var(--space-4);
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
