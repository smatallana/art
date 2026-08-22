<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { lang, setLang, t } from '$lib/i18n';
	import { app } from '$lib/state/app.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { signInUrl } from '$lib/api';
	import { catalogUsable } from '$lib/catalog/store';
	import { hasWelcomed, markWelcomed, WELCOME_HERO_ID } from '$lib/welcome';

	// First-run gate, decided synchronously so returning visitors never see
	// the welcome flash past (first real-user testing: nobody understood what
	// the app was before being asked to choose). Prerender has no storage —
	// the client re-evaluates on hydration.
	let welcomed = $state(browser ? hasWelcomed() : true);
	let authUrl = $state<string | null>(null);
	let heroFailed = $state(false);

	onMount(async () => {
		void app.init();
		await sync.init();
		authUrl = await signInUrl();
	});

	const usable = $derived(catalogUsable(app.catalog));
	const hero = $derived(welcomed || heroFailed ? undefined : app.work(WELCOME_HERO_ID));

	// The first thing a returning visitor should see is art, not a dashboard:
	// forward into the session as soon as the pool is usable. The hall stays
	// as the loading/error surface; a fresh device holds on the welcome.
	$effect(() => {
		if (usable && welcomed) void goto(`${base}/session/`, { replaceState: true });
	});

	function begin(): void {
		// Guest entry records NOTHING — only the local first-run flag. The
		// forward happens via the effect above once the pool is usable.
		markWelcomed();
		welcomed = true;
	}
</script>

<svelte:head>
	<title>Beholder</title>
</svelte:head>

{#if !welcomed}
	<main class="welcome">
		{#if hero}
			<div class="hero" aria-hidden="true">
				<img src={hero.images.display} alt="" onerror={() => (heroFailed = true)} />
				<div class="scrim"></div>
			</div>
		{/if}
		<div class="fore">
			<div class="mark" aria-hidden="true">
				<svg viewBox="0 0 96 48" width="84" height="42" role="img">
					<path
						d="M4 24 C 20 4, 76 4, 92 24 C 76 44, 20 44, 4 24 Z"
						fill="none"
						stroke="var(--gold)"
						stroke-width="2.5"
					/>
					<circle cx="48" cy="24" r="9.5" fill="none" stroke="var(--gold)" stroke-width="2.5" />
					<circle cx="48" cy="24" r="3" fill="var(--gold)" />
				</svg>
			</div>
			<h1>{t.appName}</h1>
			<p class="tagline">{t.tagline}</p>
			<p class="how">{t.welcome.how}</p>
			<p class="how journey">{t.welcome.journey}</p>
			<div class="lang-row" role="group" aria-label="Language / Idioma">
				<button class="lang" class:on={lang.current === 'en'} onclick={() => setLang('en')}>
					EN
				</button>
				<button class="lang" class:on={lang.current === 'es'} onclick={() => setLang('es')}>
					ES
				</button>
			</div>
			<div class="actions">
				<button class="start" onclick={begin}>{t.welcome.begin}</button>
				{#if sync.available && sync.authReady && authUrl}
					<a class="ghost" href={authUrl}>{t.account.signIn}</a>
				{/if}
			</div>
			<p class="privacy">{t.settings.privacy}</p>
			{#if hero}
				<p class="credit">
					{t.welcome.heroCredit(hero.artist.name, hero.title, hero.museum.name)}
				</p>
			{/if}
		</div>
	</main>
{:else}
	<main class="hall">
		<div class="mark" aria-hidden="true">
			<svg viewBox="0 0 96 48" width="84" height="42" role="img">
				<path
					d="M4 24 C 20 4, 76 4, 92 24 C 76 44, 20 44, 4 24 Z"
					fill="none"
					stroke="var(--gold)"
					stroke-width="2.5"
				/>
				<circle cx="48" cy="24" r="9.5" fill="none" stroke="var(--gold)" stroke-width="2.5" />
				<circle cx="48" cy="24" r="3" fill="var(--gold)" />
			</svg>
		</div>
		<h1>{t.appName}</h1>
		<p class="tagline">{t.tagline}</p>

		{#if usable}
			<a class="start" href={`${base}/session/`} data-sveltekit-preload-data="tap">
				{app.engine && app.engine.state.phase !== 'done' ? t.home.continue : t.home.start}
			</a>
		{:else if app.catalog.status === 'error' || app.catalog.status === 'degraded'}
			<p class="status error">{t.home.catalogError}</p>
			<button class="retry" onclick={() => void app.retryCatalog()}>{t.home.retry}</button>
		{:else}
			<p class="status" role="status">
				{t.home.catalogProgress(app.catalog.loadedShards, app.catalog.totalShards)}
			</p>
		{/if}
	</main>
{/if}

<style>
	.hall,
	.welcome {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: var(--space-2);
		padding: var(--space-5) var(--space-4);
	}
	.welcome {
		position: relative;
		overflow: hidden;
		/* clear the fixed bottom nav */
		padding-bottom: calc(72px + var(--safe-bottom));
	}
	.hero {
		position: absolute;
		inset: 0;
	}
	.hero img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.4;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			color-mix(in srgb, var(--bg) 55%, transparent),
			color-mix(in srgb, var(--bg) 30%, transparent) 45%,
			color-mix(in srgb, var(--bg) 92%, transparent) 100%
		);
	}
	.fore {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		max-width: 480px;
	}
	.mark {
		opacity: 0.9;
		margin-bottom: var(--space-2);
	}
	h1 {
		font-size: clamp(2.6rem, 9vw, 4rem);
	}
	.tagline {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--ink-muted);
		font-size: 1.15rem;
		margin: 0 0 var(--space-4);
	}
	.welcome .tagline {
		margin-bottom: var(--space-2);
		color: var(--ink);
	}
	.how {
		color: var(--ink-muted);
		font-size: 0.98rem;
		line-height: 1.55;
		max-width: 38ch;
		margin: 0 0 var(--space-4);
	}
	.how.journey {
		color: var(--ink-faint);
		font-size: 0.85rem;
		margin-top: calc(-1 * var(--space-3));
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
	}
	.lang-row {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.lang {
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--ink-muted);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		padding: 8px 16px;
		min-height: 44px;
		cursor: pointer;
	}
	.lang.on {
		border-color: var(--gold);
		color: var(--gold);
	}
	.status {
		color: var(--ink-faint);
		font-size: 0.9rem;
	}
	.status.error {
		color: var(--ink-muted);
		max-width: 34ch;
	}
	.start {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--gold);
		color: #1a1408;
		font-weight: 600;
		border-radius: 999px;
		padding: 16px 44px;
		font-size: 1.05rem;
		min-height: 52px;
		text-decoration: none;
		border: none;
		cursor: pointer;
	}
	.start:hover {
		text-decoration: none;
		filter: brightness(1.06);
	}
	.ghost {
		border: 1px solid var(--gold-deep);
		border-radius: 999px;
		padding: 12px 28px;
		color: var(--ink);
		font-size: 0.92rem;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.ghost:hover {
		text-decoration: none;
	}
	.privacy {
		color: var(--ink-faint);
		font-size: 0.8rem;
		max-width: 40ch;
		margin-top: var(--space-4);
	}
	.credit {
		color: var(--ink-faint);
		font-size: 0.72rem;
		margin-top: var(--space-2);
	}
	.retry {
		background: none;
		border: 1px solid var(--ink-faint);
		color: var(--ink-muted);
		border-radius: 999px;
		padding: 8px 22px;
		font-size: 0.9rem;
		min-height: 40px;
		cursor: pointer;
	}
</style>
