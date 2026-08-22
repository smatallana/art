<script lang="ts">
	import { t } from '$lib/i18n';
	import { back } from '$lib/state/nav.svelte';

	/** Parent route (without base) when there is no in-app history. */
	let { fallback }: { fallback: string } = $props();
</script>

<button class="back" onclick={() => back(fallback)}>← {t.nav.back}</button>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 var(--space-2) 0 0;
		color: var(--ink-faint);
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		cursor: pointer;
		align-self: flex-start;
	}
	.back:hover {
		color: var(--ink-muted);
	}
</style>
