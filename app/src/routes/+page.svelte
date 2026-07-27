<script lang="ts">
	import { APP_VERSION } from '$lib/version';
</script>

<svelte:head>
	<title>Beholder</title>
</svelte:head>

<main class="hall">
	<div class="mark" aria-hidden="true">
		<svg viewBox="0 0 96 48" width="96" height="48" role="img">
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
	<h1>Beholder</h1>
	<p class="tagline">Learn your own eye.</p>
	<p class="status">
		The gallery is being hung — the collection and the first sessions arrive shortly.
	</p>
	<footer>
		<span>v{APP_VERSION}</span>
	</footer>
</main>

<style>
	.hall {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: var(--space-3);
		padding: var(--space-5) var(--space-4);
		padding-bottom: max(var(--safe-bottom), var(--space-5));
	}

	.mark {
		opacity: 0.9;
		margin-bottom: var(--space-2);
	}

	h1 {
		font-size: clamp(2.6rem, 9vw, 4rem);
		font-variation-settings: 'opsz' 90;
	}

	.tagline {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--ink-muted);
		font-size: 1.15rem;
		margin: 0;
	}

	.status {
		color: var(--ink-faint);
		font-size: 0.85rem;
		max-width: 34ch;
		margin: var(--space-4) 0 0;
	}

	footer {
		position: fixed;
		bottom: max(var(--safe-bottom), 12px);
		color: var(--ink-faint);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
	}
</style>
