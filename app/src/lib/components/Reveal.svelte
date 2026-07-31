<script lang="ts">
	import type { Work } from '../catalog/types';
	import type { ElementId, EmotionId, PairAspect } from '../engine/events';
	import { CONTENT_PROBLEM_ASPECTS } from '../engine/events';
	import { explainPair, wantsStrength } from '../engine/insight';
	import { ONTOLOGY_DIMS } from '../engine/ontology';
	import type { SessionPair } from '../engine/session';
	import { t } from '../i18n/en';
	import { app } from '../state/app.svelte';
	import ArtworkImage from './ArtworkImage.svelte';

	let {
		workA,
		workB,
		pick,
		slot,
		position,
		onNext,
		microLine = null
	}: {
		workA: Work;
		workB: Work;
		pick: 'a' | 'b' | 'both' | 'neither' | 'unsure';
		slot: SessionPair['slot'];
		position: number;
		onNext: () => void;
		/** Mid-session micro-insight, shown AFTER the answer — never on the
		 *  choosing screen (pre-choice priming, fourth external review). */
		microLine?: string | null;
	} = $props();

	// The reveal must respect the answer given: only a definite pick features
	// a work. Both/neither/unsure show the pair as equals (external review).
	const chosen = $derived(pick === 'a' ? workA : pick === 'b' ? workB : null);
	const other = $derived(pick === 'a' ? workB : pick === 'b' ? workA : null);
	const askStrength = $derived(chosen != null && wantsStrength(slot, position));
	const explain = $derived(explainPair(workA, workB, ONTOLOGY_DIMS));

	let strengthSent = $state(false);
	let emotions = $state<EmotionId[]>([]);
	let elements = $state<ElementId[]>([]);
	let aspects = $state<PairAspect[]>([]);

	const EMOTIONS = Object.entries(t.emotions) as [EmotionId, string][];
	const ELEMENTS = Object.entries(t.elements) as [ElementId, string][];

	const BRANCH: Record<string, { title: string; prompt: string; options: PairAspect[] }> = {
		both: {
			title: t.session.bothTitle,
			prompt: t.session.bothPrompt,
			options: ['atmosphere', 'subject', 'color', 'emotion', 'composition', 'technique', 'not-sure']
		},
		neither: {
			title: t.session.neitherTitle,
			prompt: t.session.neitherPrompt,
			options: [
				'subject',
				'color',
				'style',
				'too-decorative',
				'too-abstract',
				'too-busy',
				'flat',
				'no-pull',
				'image-quality',
				'hard-to-judge'
			]
		},
		unsure: {
			title: t.session.unsureTitle,
			prompt: t.session.unsurePrompt,
			options: ['too-similar', 'hard-to-judge', 'image-quality', 'not-sure']
		}
	};
	const branch = $derived(chosen ? null : BRANCH[pick]);

	async function sendStrength(level: 'slight' | 'clear' | 'strong'): Promise<void> {
		if (strengthSent || !chosen || !other) return;
		strengthSent = true;
		await app.record({ t: 'strength', a: chosen.id, b: other.id, level });
	}

	async function toggleEmotion(id: EmotionId): Promise<void> {
		if (!chosen) return;
		emotions = emotions.includes(id)
			? emotions.filter((e) => e !== id)
			: [...emotions, id].slice(-2);
		await app.record({ t: 'reaction', work: chosen.id, emotions, elements });
	}

	async function toggleElement(id: ElementId): Promise<void> {
		if (!chosen) return;
		elements = elements.includes(id)
			? elements.filter((e) => e !== id)
			: [...elements, id].slice(-2);
		await app.record({ t: 'reaction', work: chosen.id, emotions, elements });
	}

	async function toggleAspect(id: PairAspect): Promise<void> {
		aspects = aspects.includes(id) ? aspects.filter((a) => a !== id) : [...aspects, id].slice(-2);
		const kind = pick === 'both' ? 'shared' : pick === 'neither' ? 'pushed-away' : 'unsure-why';
		await app.record({ t: 'pair_feedback', a: workA.id, b: workB.id, kind, aspects });
	}

	async function save(work: Work): Promise<void> {
		if (app.savedIds.has(work.id)) await app.record({ t: 'unsave', work: work.id });
		else await app.record({ t: 'save', work: work.id });
	}

	async function remember(work: Work): Promise<void> {
		if (!app.rememberedIds.has(work.id)) await app.record({ t: 'remember', work: work.id });
	}

	function infoLine(w: Work): string {
		return `${w.artist.name} · ${w.date.display}`;
	}

	function whyLine(): string | null {
		if (!explain) return null;
		let line = t.session.whyPairSpecific(explain.dimLabels[0], explain.dimLabels[1]);
		if (explain.eraGap != null && explain.dimLabels.length > 0 && explain.dimLabels[0]) {
			line += t.session.whyPairEra(Math.round(explain.eraGap / 100));
		}
		return line;
	}
</script>

<section class="reveal">
	{#if chosen && other}
		<!-- Definite pick: feature the chosen work, compact by default. -->
		<div class="focus-art">
			<ArtworkImage work={chosen} />
		</div>
		<div class="card">
			<h2>{chosen.title}</h2>
			<p class="meta">{infoLine(chosen)} · {chosen.museum.name}</p>
			{#if chosen.story}
				<p class="story">{chosen.story}</p>
			{/if}
			{#if chosen.rights.status === 'in-copyright'}
				<p class="rights">{chosen.rights.attribution}</p>
			{/if}
			<div class="actions">
				<button class="chip" onclick={() => save(chosen)}>
					{app.savedIds.has(chosen.id) ? t.session.saved : t.session.save}
				</button>
			</div>
		</div>

		<details class="fold">
			<summary>{t.session.addContext}</summary>
			{#if askStrength && !strengthSent}
				<!-- Strength lives inside the fold (owner decision, tramo 9 —
				     reverses the tramo-7 "selective visible" placement). -->
				<p class="prompt-line">{t.session.strengthPrompt}</p>
				<div class="chips">
					<button class="chip" onclick={() => sendStrength('slight')}
						>{t.session.strengthSlight}</button
					>
					<button class="chip" onclick={() => sendStrength('clear')}
						>{t.session.strengthClear}</button
					>
					<button class="chip" onclick={() => sendStrength('strong')}
						>{t.session.strengthStrong}</button
					>
				</div>
			{/if}
			<p class="prompt-line">{t.session.reactionPrompt}</p>
			<div class="chips">
				{#each EMOTIONS as [id, label] (id)}
					<button class="chip" class:on={emotions.includes(id)} onclick={() => toggleEmotion(id)}>
						{label}
					</button>
				{/each}
			</div>
			<p class="prompt-line">{t.session.elementPrompt}</p>
			<div class="chips">
				{#each ELEMENTS as [id, label] (id)}
					<button class="chip" class:on={elements.includes(id)} onclick={() => toggleElement(id)}>
						{label}
					</button>
				{/each}
			</div>
			<div class="chips">
				<button class="chip" onclick={() => remember(chosen)}>
					{app.rememberedIds.has(chosen.id) ? t.session.remembered : t.session.remember}
				</button>
			</div>
		</details>

		<details class="fold">
			<summary>{t.session.learnMore}</summary>
			<p class="meta">{chosen.rights.attribution}</p>
			<a href={chosen.museum.url} target="_blank" rel="noreferrer">{t.reveal.viewAtMuseum}</a>
			{#if whyLine()}
				<p class="why"><span class="label">{t.reveal.whyThisPair}</span> {whyLine()}</p>
			{/if}
		</details>

		<div class="ref">
			<div class="ref-thumb"><ArtworkImage work={other} size="thumb" /></div>
			<div class="ref-text">
				<p class="ref-title">{other.title}</p>
				<p class="meta">{infoLine(other)}</p>
			</div>
		</div>
	{:else if branch}
		<!-- Both / neither / unsure: the pair stays equal; no work is elevated. -->
		<h2 class="branch-title">{branch.title}</h2>
		<div class="pair-grid" class:muted={pick === 'neither'}>
			{#each [workA, workB] as w (w.id)}
				<div class="pair-cell">
					<ArtworkImage work={w} size="thumb" />
					<p class="ref-title">{w.title}</p>
					<p class="meta">{infoLine(w)}</p>
					{#if pick === 'both'}
						<button class="chip" onclick={() => save(w)}>
							{app.savedIds.has(w.id) ? t.session.saved : t.session.save}
						</button>
					{/if}
				</div>
			{/each}
		</div>
		<div class="block">
			<p class="prompt-line">{branch.prompt}</p>
			<div class="chips">
				{#each branch.options as id (id)}
					<button class="chip" class:on={aspects.includes(id)} onclick={() => toggleAspect(id)}>
						{t.aspects[id]}
					</button>
				{/each}
			</div>
			{#if pick === 'neither' && aspects.length > 0}
				<!-- Honest about what the model does: a content flag means the pair
				     is NOT counted, so the "lean away" promise would be false. -->
				<p class="meta">
					{aspects.some((a) => CONTENT_PROBLEM_ASPECTS.has(a))
						? t.session.neitherLearningFlagged
						: t.session.neitherLearning}
				</p>
			{/if}
		</div>
	{/if}

	{#if microLine}
		<p class="micro-line">
			<span>{t.session.microPrefix}</span>
			{t.session.micro(microLine)}
		</p>
	{/if}

	<div class="next-bar">
		{#if app.undoableIds.length > 0}
			<button class="undo" onclick={() => void app.undoLastPair()}>{t.session.undo}</button>
		{/if}
		<button class="next" onclick={onNext}>{t.session.next}</button>
	</div>
</section>

<style>
	.reveal {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: calc(96px + var(--safe-bottom));
	}
	.focus-art {
		max-height: 40dvh;
		display: flex;
		justify-content: center;
	}
	.card h2 {
		font-size: 1.35rem;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.85rem;
		margin: var(--space-1) 0 0;
		overflow-wrap: anywhere;
	}
	.story {
		font-family: var(--font-display);
		font-size: 0.98rem;
		line-height: 1.5;
		margin: var(--space-2) 0 0;
	}
	.micro-line {
		color: var(--ink-faint);
		font-size: 0.82rem;
		font-style: italic;
		text-align: center;
		margin: var(--space-2) 0 0;
	}
	.micro-line span {
		color: var(--accent, var(--ink-muted));
		font-style: normal;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-size: 0.72rem;
		margin-right: 4px;
	}
	.rights {
		color: var(--ink-faint);
		font-size: 0.75rem;
		margin: var(--space-1) 0 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.prompt-line {
		color: var(--ink-faint);
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin: var(--space-2) 0 var(--space-1);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		color: var(--ink-muted);
		font-size: 0.85rem;
		padding: 8px 14px;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		min-height: 44px;
	}
	.chip.on {
		border-color: var(--gold);
		color: var(--gold);
	}
	.fold {
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-2);
	}
	.fold summary {
		color: var(--ink-muted);
		font-size: 0.9rem;
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.fold a {
		color: var(--gold-deep);
		font-size: 0.9rem;
	}
	.why {
		color: var(--ink-muted);
		font-size: 0.88rem;
		line-height: 1.5;
		margin-top: var(--space-2);
	}
	.why .label {
		color: var(--ink-faint);
		font-size: 0.75rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		display: block;
	}
	/* Reference card: thumb and text in separate grid tracks — no absolute
	   positioning, long titles wrap, nothing can collide (external review). */
	.ref {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: var(--space-2);
		align-items: center;
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-3);
	}
	.ref-thumb {
		width: 72px;
	}
	.ref-text {
		min-width: 0;
	}
	.ref-title {
		font-size: 0.92rem;
		line-height: 1.3;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.branch-title {
		font-size: 1.25rem;
		text-align: center;
		margin-top: var(--space-2);
	}
	.pair-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}
	.pair-grid.muted {
		opacity: 0.75;
	}
	.pair-cell {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.next-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: var(--space-3) var(--space-4) max(var(--safe-bottom), var(--space-3));
		background: linear-gradient(transparent, var(--bg) 35%);
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		gap: var(--space-3);
	}
	.undo {
		color: var(--ink-muted);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 14px 20px;
		font-size: 0.9rem;
		min-height: 48px;
		white-space: nowrap;
	}
	.next {
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 14px 44px;
		font-size: 1rem;
		min-height: 48px;
	}
</style>
