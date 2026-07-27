<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(async () => {
		// Register the service worker (production builds only — the virtual
		// module is a no-op stub during dev).
		try {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
		} catch {
			// PWA disabled (dev) or unsupported browser — the app works without it.
		}
	});
</script>

<div class="shell">
	{@render children()}
</div>

<style>
	.shell {
		min-height: 100dvh;
		padding-top: var(--safe-top);
		padding-left: var(--safe-left);
		padding-right: var(--safe-right);
		display: flex;
		flex-direction: column;
	}
</style>
