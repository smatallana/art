<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import ArtworkImage from '$lib/components/ArtworkImage.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';

	let shownAt = $state(0);
	let lastPick = $state<'a' | 'b' | 'both' | 'neither' | 'unsure'>('unsure');

	const sess = $derived(app.engine?.state ?? null);
	const workA = $derived(sess?.current ? app.work(sess.current.aId) : undefined);
	const workB = $derived(sess?.current ? app.work(sess.current.bId) : undefined);
	const chosen = $derived(lastPick === 'a' ? workA : lastPick === 'b' ? workB : undefined);
	const other = $derived(lastPick === 'a' ? workB : lastPick === 'b' ? workA : undefined);

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
		goto(`${base}/`);
	}

	function onKey(e: KeyboardEvent): void {
		if (!sess) return;
		if (sess.phase === 'choosing') {
			if (e.key === '1' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') void choose('a');
			else if (e.key === '2' || e.key === 'ArrowDown' || e.key === 'ArrowRight') void choose('b');
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
		</header>

		{#if sess.phase === 'choosing' && workA && workB}
			<h1 class="prompt">{t.session.whichOne}</h1>
			<div class="pair" role="group" aria-label={t.a11y.artworkPair}>
				<button class="art" aria-label={t.a11y.choiceA} onclick={() => choose('a')}>
					<ArtworkImage work={workA} onError={() => app.skipPair()} />
				</button>
				<button class="art" aria-label={t.a11y.choiceB} onclick={() => choose('b')}>
					<ArtworkImage work={workB} onError={() => app.skipPair()} />
				</button>
			</div>
			<div class="alt-row">
				<button class="alt" onclick={() => choose('both')}>{t.session.both}</button>
				<button class="alt" onclick={() => choose('neither')}>{t.session.neither}</button>
				<button class="alt" onclick={() => choose('unsure')}>{t.session.unsure}</button>
			</div>
		{:else if sess.phase === 'revealed' && workA && workB}
			<Reveal
				chosen={chosen ?? null}
				other={other ?? (chosen ? null : workA)}
				probe={sess.current?.probe ?? 'coverage'}
				onNext={next}
			/>
		{:else if sess.phase === 'done'}
			<section class="summary">
				<h1>{t.session.summaryTitle}</h1>
				<p>{t.session.summaryBody(sess.position)}</p>
				{#if sess.position === 0}
					<p class="empty">{t.session.emptyPool}</p>
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
						{t.session.summaryAgain}
					</button>
					<button class="secondary" onclick={finish}>{t.session.summaryHome}</button>
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
