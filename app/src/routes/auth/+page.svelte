<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/en';
	import { app } from '$lib/state/app.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { markWelcomed } from '$lib/welcome';

	let failed = $state(false);

	onMount(async () => {
		await app.init();
		await sync.init();
		const match = /[#&]otc=([a-f0-9]+)/.exec(location.hash);
		if (match) {
			history.replaceState(null, '', location.pathname); // never keep the code around
			const ok = await sync.completeSignIn(match[1] as string);
			if (ok) {
				// Signing in fulfills the first run; land in the art, not settings.
				markWelcomed();
				goto(`${base}/session/`);
				return;
			}
		}
		failed = true;
	});
</script>

<svelte:head>
	<title>Sign in — Beholder</title>
</svelte:head>

<main class="page">
	{#if failed}
		<h1>{t.account.signInFailed}</h1>
		<p class="hint">{t.account.signInFailedHint}</p>
		<a class="btn" href={`${base}/settings/`}>{t.nav.settings}</a>
	{:else}
		<p class="hint">{t.account.signingIn}</p>
	{/if}
</main>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		text-align: center;
		padding: var(--space-5);
	}
	.hint {
		color: var(--ink-muted);
	}
	.btn {
		border: 1px solid var(--gold-deep);
		border-radius: 999px;
		padding: 12px 22px;
		color: var(--ink);
	}
	.btn:hover {
		text-decoration: none;
	}
</style>
