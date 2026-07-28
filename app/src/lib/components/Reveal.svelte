<script lang="ts">
	import type { Work } from '../catalog/types';
	import type { ElementId, EmotionId } from '../engine/events';
	import { t } from '../i18n/en';
	import { app } from '../state/app.svelte';
	import ArtworkImage from './ArtworkImage.svelte';

	let {
		chosen,
		other,
		probe,
		onNext
	}: {
		chosen: Work | null; // null when the pick was both/neither/unsure
		other: Work | null;
		probe: 'cross-era' | 'cross-subject' | 'within-stratum' | 'coverage';
		onNext: () => void;
	} = $props();

	const focus = $derived(chosen ?? other);
	const secondary = $derived(chosen ? other : null);

	let strengthSent = $state(false);
	let emotions = $state<EmotionId[]>([]);
	let elements = $state<ElementId[]>([]);

	const EMOTIONS = Object.entries(t.emotions) as [EmotionId, string][];
	const ELEMENTS = Object.entries(t.elements) as [ElementId, string][];

	async function sendStrength(level: 'slight' | 'clear' | 'strong'): Promise<void> {
		if (strengthSent || !chosen || !other) return;
		strengthSent = true;
		await app.record({ t: 'strength', a: chosen.id, b: other.id, level });
	}

	async function toggleEmotion(id: EmotionId): Promise<void> {
		if (!focus) return;
		emotions = emotions.includes(id)
			? emotions.filter((e) => e !== id)
			: [...emotions, id].slice(-2); // at most two
		await app.record({ t: 'reaction', work: focus.id, emotions, elements });
	}

	async function toggleElement(id: ElementId): Promise<void> {
		if (!focus) return;
		elements = elements.includes(id)
			? elements.filter((e) => e !== id)
			: [...elements, id].slice(-2);
		await app.record({ t: 'reaction', work: focus.id, emotions, elements });
	}

	async function save(work: Work): Promise<void> {
		if (app.savedIds.has(work.id)) await app.record({ t: 'unsave', work: work.id });
		else await app.record({ t: 'save', work: work.id });
	}

	async function remember(work: Work): Promise<void> {
		if (!app.rememberedIds.has(work.id)) await app.record({ t: 'remember', work: work.id });
	}

	function infoLine(w: Work): string {
		return `${w.artist.name} · ${w.date.display} · ${w.museum.name}`;
	}
</script>

<section class="reveal">
	{#if focus}
		<div class="focus-art">
			<ArtworkImage work={focus} />
		</div>
		<div class="card">
			<h2>{focus.title}</h2>
			<p class="meta">{infoLine(focus)}</p>
			{#if focus.story}
				<p class="story">{focus.story}</p>
			{/if}
			<p class="attribution">{focus.rights.attribution}</p>

			<div class="actions">
				<button class="chip solid" onclick={() => save(focus)}>
					{app.savedIds.has(focus.id) ? t.session.saved : t.session.save}
				</button>
				<button class="chip solid" onclick={() => remember(focus)}>
					{app.rememberedIds.has(focus.id) ? t.session.remembered : t.session.remember}
				</button>
				<a class="chip link" href={focus.museum.url} target="_blank" rel="noopener">
					{t.reveal.viewAtMuseum}
				</a>
			</div>

			{#if chosen && other && !strengthSent}
				<div class="group">
					<span class="label">{t.session.strengthPrompt}</span>
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
				</div>
			{/if}

			<div class="group">
				<span class="label">{t.session.reactionPrompt}</span>
				<div class="chips">
					{#each EMOTIONS as [id, label] (id)}
						<button class="chip" class:on={emotions.includes(id)} onclick={() => toggleEmotion(id)}>
							{label}
						</button>
					{/each}
				</div>
			</div>

			<div class="group">
				<span class="label">{t.session.elementPrompt}</span>
				<div class="chips">
					{#each ELEMENTS as [id, label] (id)}
						<button class="chip" class:on={elements.includes(id)} onclick={() => toggleElement(id)}>
							{label}
						</button>
					{/each}
				</div>
			</div>
		</div>

		{#if secondary}
			<div class="other">
				<div class="other-thumb">
					<ArtworkImage work={secondary} size="thumb" />
				</div>
				<div class="other-info">
					<h3>{secondary.title}</h3>
					<p class="meta">{infoLine(secondary)}</p>
				</div>
			</div>
		{/if}

		<p class="why">
			<span class="label">{t.reveal.whyThisPair}</span>
			{t.session.probeExplain[probe]}
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
		padding-bottom: calc(72px + var(--safe-bottom));
	}
	.focus-art {
		max-height: 44dvh;
		display: flex;
		justify-content: center;
	}
	.card h2 {
		font-size: 1.45rem;
		line-height: 1.2;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.85rem;
		margin: var(--space-1) 0 0;
	}
	.story {
		font-family: var(--font-display);
		font-size: 1rem;
		line-height: 1.5;
		margin: var(--space-3) 0 0;
	}
	.attribution {
		color: var(--ink-faint);
		font-size: 0.7rem;
		margin: var(--space-2) 0 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.group {
		margin-top: var(--space-3);
	}
	.label {
		display: block;
		color: var(--ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: var(--space-2);
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
		min-height: 40px;
	}
	.chip.on,
	.chip.solid {
		color: var(--ink);
		border-color: var(--gold-deep);
	}
	.chip.on {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
	}
	.chip.link {
		display: inline-flex;
		align-items: center;
	}
	.other {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-3);
	}
	.other-thumb {
		width: 84px;
		flex-shrink: 0;
	}
	.other-info h3 {
		font-size: 1rem;
	}
	.why {
		color: var(--ink-muted);
		font-size: 0.85rem;
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-3);
	}
	.next-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: var(--space-3) var(--space-4) max(var(--safe-bottom), var(--space-3));
		background: linear-gradient(transparent, var(--bg) 35%);
		display: flex;
		justify-content: center;
		gap: var(--space-3);
	}
	.undo {
		color: var(--ink-muted);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 14px 22px;
		font-size: 0.9rem;
		min-height: 48px;
	}
	.next {
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 14px 48px;
		font-size: 1rem;
		min-height: 48px;
		width: min(100%, 420px);
	}
</style>
