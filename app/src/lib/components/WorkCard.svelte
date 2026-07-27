<script lang="ts">
	import { base } from '$app/paths';
	import type { Work } from '../catalog/types';
	import ArtworkImage from './ArtworkImage.svelte';

	let { work, why = [] }: { work: Work; why?: { label: string }[] } = $props();
</script>

<a class="card" href={`${base}/work/${work.id}/`}>
	<div class="thumb"><ArtworkImage {work} size="thumb" /></div>
	<h3>{work.title}</h3>
	<p class="meta">{work.artist.name} · {work.date.display}</p>
	{#if why.length > 0}
		<p class="why">{why.map((c) => c.label).join(' · ')}</p>
	{/if}
</a>

<style>
	.card {
		display: block;
		width: 176px;
		flex-shrink: 0;
		color: inherit;
	}
	.card:hover {
		text-decoration: none;
	}
	.thumb {
		margin-bottom: 8px;
	}
	h3 {
		font-size: 0.86rem;
		font-weight: 500;
		line-height: 1.25;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.72rem;
		margin: 3px 0 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.why {
		color: var(--gold-deep);
		font-size: 0.68rem;
		margin: 4px 0 0;
		line-height: 1.3;
	}
</style>
