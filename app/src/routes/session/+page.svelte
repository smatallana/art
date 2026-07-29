<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import { microInsight, sessionSummary } from '$lib/engine/insight';
	import { ONTOLOGY_DIMS } from '$lib/engine/ontology';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';

	let shownAt = $state(0);
	let lastPick = $state<'a' | 'b' | 'both' | 'neither' | 'unsure'>('unsure');

	const sess = $derived(app.engine?.state ?? null);
	// Events belonging to THIS session (ISO strings compare chronologically).
	const sessionEvents = $derived(sess ? app.events.filter((e) => e.at >= sess.startedAt) : []);
	let microDismissed = $state(-1);
	const micro = $derived.by(() => {
		if (!sess || sess.phase !== 'choosing') return null;
		if (sess.position !== 4 && sess.position !== 8) return null;
		if (microDismissed >= sess.position) return null;
		return microInsight(sessionEvents, (id) => app.work(id), ONTOLOGY_DIMS);
	});
	const summary = $derived.by(() =>
		sess?.phase === 'done'
			? sessionSummary(sessionEvents, (id) => app.work(id), ONTOLOGY_DIMS)
			: null
	);
	const workA = $derived(sess?.current ? app.work(sess.current.aId) : undefined);
	const workB = $derived(sess?.current ? app.work(sess.current.bId) : undefined);
	// Deterministic per-pair coin flip so display side never correlates with
	// the selector's slot assignment (position-bias control). Stable across
	// re-renders and resume; recording still refers to engine slots a/b.
	const flipped = $derived.by(() => {
		if (!sess?.current) return false;
		const key = sess.current.aId + sess.current.bId;
		let h = 0;
		for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
		return (h & 1) === 1;
	});
	const firstWork = $derived(flipped ? workB : workA);
	const secondWork = $derived(flipped ? workA : workB);

	onMount(async () => {
		await app.init();
		if (!app.engine) await app.startOrResumeSession();
		if (!app.engine) goto(`${base}/`);
		shownAt = performance.now();
	});

	async function choose(pick: 'a' | 'b' | 'both' | 'neither' | 'unsure'): Promise<void> {
		if (!sess?.current) return;
		lastPick = pick;
		const ms = Math.min(120000, Math.round(performance.now() - shownAt));
		await app.answerPair(pick, ms);
	}

	async function next(): Promise<void> {
		await app.nextPair();
		shownAt = performance.now();
	}

	async function finish(): Promise<void> {
		await app.endSession();
		// Home forwards into a session, so the resting place is the profile.
		goto(`${base}/profile/`);
	}

	function onKey(e: KeyboardEvent): void {
		if (!sess) return;
		if (sess.phase === 'choosing') {
			if (e.key === '1' || e.key === 'ArrowUp' || e.key === 'ArrowLeft')
				void choose(flipped ? 'b' : 'a');
			else if (e.key === '2' || e.key === 'ArrowDown' || e.key === 'ArrowRight')
				void choose(flipped ? 'a' : 'b');
		} else if (sess.phase === 'revealed' && e.key === 'Enter') {
			void next();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>Session — Beholder</title>
</svelte:head>

{#if sess}
	<main class="session">
		<header class="top">
			<div
				class="progress"
				role="progressbar"
				aria-valuenow={sess.position}
				aria-valuemin={0}
				aria-valuemax={sess.length}
			>
				<div class="bar" style:width={`${(sess.position / sess.length) * 100}%`}></div>
			</div>
			<span class="count">
				{t.session.progress(Math.min(sess.position + 1, sess.length), sess.length)}
			</span>
			<button class="exit" onclick={finish}>{t.session.finish}</button>
		</header>

		{#if sess.phase === 'choosing' && firstWork && secondWork}
			<h1 class="prompt">{t.session.whichOne}</h1>
			{#if micro}
				<button class="micro" onclick={() => (microDismissed = sess.position)}>
					<span class="micro-label">{t.session.microPrefix}</span>
					{t.session.micro(micro)} ×
				</button>
			{/if}
			<div class="pair" role="group" aria-label={t.a11y.artworkPair}>
				<button class="art" aria-label={t.a11y.choiceA} onclick={() => choose(flipped ? 'b' : 'a')}>
					<ArtworkImage work={firstWork} blind onError={(id) => app.reportImageFailure(id)} />
				</button>
				<button class="art" aria-label={t.a11y.choiceB} onclick={() => choose(flipped ? 'a' : 'b')}>
					<ArtworkImage work={secondWork} blind onError={(id) => app.reportImageFailure(id)} />
				</button>
			</div>
			<div class="alt-row">
				<button class="alt" onclick={() => choose('both')}>{t.session.both}</button>
				<button class="alt" onclick={() => choose('neither')}>{t.session.neither}</button>
				<button class="alt" onclick={() => choose('unsure')}>{t.session.unsure}</button>
				<button class="alt" onclick={() => app.skipPair()}>{t.session.skip}</button>
			</div>
		{:else if sess.phase === 'revealed' && workA && workB}
			<Reveal
				{workA}
				{workB}
				pick={lastPick}
				slot={sess.current?.slot ?? 'calibration'}
				position={sess.position}
				onNext={next}
			/>
		{:else if sess.phase === 'done' && summary}
			<section class="summary">
				<h1>
					{summary.patterns.length > 0
						? summary.patterns[0].n >= 3
							? t.session.insightHeadline
							: t.session.insightHeadlineEarly
						: t.session.insightHeadlineNone}
				</h1>
				{#if summary.patterns.length > 0}
					<p class="insight">
						{(summary.patterns[0].n >= 3
							? t.session.insightPattern
							: t.session.insightPatternEarly)(
							summary.patterns.map((p) => p.label.toLowerCase()).join(' and ')
						)}
					</p>
					{#if summary.counter}
						<p class="insight-sub">
							{t.session.insightCounter(summary.counter.label.toLowerCase())}
						</p>
					{/if}
				{:else if summary.answered > 0}
					<p class="insight">{t.session.insightNone}</p>
				{:else}
					<p class="empty">{t.session.emptyPool}</p>
				{/if}
				{#if summary.evidenceWorkIds.length > 0}
					<div class="evidence">
						<p class="evidence-label">{t.session.insightEvidence}</p>
						<div class="evidence-row">
							{#each summary.evidenceWorkIds as id (id)}
								{@const w = app.work(id)}
								{#if w}
									<a class="evidence-item" href={`${base}/work/${id}/`}>
										<ArtworkImage work={w} size="thumb" />
									</a>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
				{#if summary.openQuestion}
					<p class="insight-sub">{t.session.insightOpen(summary.openQuestion)}</p>
					<p class="insight-sub next-hint">{t.session.insightNext(summary.openQuestion)}</p>
				{/if}
				<div class="summary-actions">
					<button
						class="primary"
						onclick={async () => {
							await app.endSession();
							await app.startOrResumeSession();
							shownAt = performance.now();
						}}
					>
						{summary.patterns.length > 0 ? t.session.summaryAgain : t.session.summaryAgainNeutral}
					</button>
					<button class="secondary" onclick={finish}>{t.session.summaryHome}</button>
					<p class="saved-note">{t.session.summarySaved}</p>
				</div>
			</section>
		{/if}
	</main>
{/if}

<style>
	.session {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: var(--space-3) var(--space-3) 0;
		max-width: 1100px;
		margin: 0 auto;
		width: 100%;
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.progress {
		flex: 1;
		height: 2px;
		background: var(--hairline);
		border-radius: 1px;
	}
	.bar {
		height: 100%;
		background: var(--gold);
		border-radius: 1px;
		transition: width 300ms ease;
	}
	.count {
		color: var(--ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
	}
	.exit {
		color: var(--ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		padding: 8px 10px;
		min-height: 36px;
		border: none;
		background: none;
		cursor: pointer;
	}
	.exit:hover {
		color: var(--ink-muted);
	}
	.prompt {
		text-align: center;
		font-size: 1.05rem;
		font-style: italic;
		color: var(--ink-muted);
		font-weight: 400;
		margin: var(--space-3) 0;
	}
	.pair {
		flex: 1;
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: var(--space-3);
		min-height: 0;
		padding-bottom: var(--space-2);
	}
	.art {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		border-radius: 6px;
		transition: transform 140ms ease;
	}
	.art:active {
		transform: scale(0.985);
	}
	@media (orientation: landscape), (min-width: 900px) {
		.pair {
			grid-template-rows: none;
			grid-template-columns: 1fr 1fr;
		}
	}
	.alt-row {
		display: flex;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-3) 0 max(var(--safe-bottom), var(--space-3));
	}
	.alt {
		color: var(--ink-muted);
		font-size: 0.85rem;
		padding: 10px 16px;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		min-height: 42px;
	}
	.micro {
		align-self: center;
		color: var(--ink-muted);
		font-size: 0.82rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 6px 14px;
		margin-bottom: var(--space-2);
		max-width: 90%;
	}
	.micro-label {
		color: var(--gold-deep);
		letter-spacing: 0.04em;
	}
	.insight {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 1.05rem;
		line-height: 1.5;
		max-width: 44ch;
	}
	.insight-sub {
		color: var(--ink-muted);
		font-size: 0.9rem;
		max-width: 44ch;
	}
	.next-hint {
		color: var(--gold-deep);
	}
	.evidence {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: center;
	}
	.evidence-label {
		color: var(--ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.evidence-row {
		display: flex;
		gap: var(--space-2);
		justify-content: center;
	}
	.evidence-item {
		width: 84px;
	}
	.saved-note {
		color: var(--ink-faint);
		font-size: 0.78rem;
		text-align: center;
	}
	.summary {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: var(--space-3);
	}
	.summary h1 {
		font-size: 1.8rem;
	}
	.summary p {
		color: var(--ink-muted);
	}
	.summary-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
		width: min(100%, 320px);
	}
	.primary {
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 14px 24px;
		min-height: 48px;
	}
	.secondary {
		color: var(--ink-muted);
		padding: 12px;
		min-height: 44px;
	}
</style>
