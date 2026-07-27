import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Base path: '/art' on GitHub Pages (project site), '' in dev. */
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// SPA fallback: GitHub Pages serves 404.html for unknown paths,
			// which boots the client router so deep links keep working.
			fallback: '404.html'
		}),
		paths: { base },
		serviceWorker: { register: false }
	}
};

export default config;
