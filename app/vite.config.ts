import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

const base = process.env.BASE_PATH ?? '';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: null,
			includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
			manifest: {
				name: 'Beholder',
				short_name: 'Beholder',
				description:
					'A personal art-taste discovery app. Compare paintings, build a living profile of your eye, and remember what you love.',
				id: `${base}/`,
				start_url: `${base}/`,
				scope: `${base}/`,
				display: 'standalone',
				orientation: 'any',
				background_color: '#121014',
				theme_color: '#121014',
				lang: 'en',
				categories: ['education', 'entertainment', 'lifestyle'],
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'icons/maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'catalog/bootstrap.json'],
				// Never let the SW cache grow unbounded with artwork images:
				// runtime caching below is capped and expires.
				runtimeCaching: [
					{
						// The catalog index is the generation pointer — always try the
						// network first so a new deploy is noticed immediately.
						urlPattern: ({ url }) => url.pathname.endsWith('/catalog/index.json'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'catalog-index',
							networkTimeoutSeconds: 8,
							expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }
						}
					},
					{
						// Catalog shards: fast, revalidate in background.
						urlPattern: ({ url }) => url.pathname.includes('/catalog/'),
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'catalog',
							expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }
						}
					},
					{
						// Artwork images (museum CDNs now, R2 later).
						urlPattern: ({ request }) => request.destination === 'image',
						handler: 'CacheFirst',
						options: {
							cacheName: 'artwork-images',
							// Opaque (status 0) responses are indistinguishable from
							// failures — a cached 403 would serve for 60 days. The
							// client evicts + refetches on image error (ArtworkImage).
							cacheableResponse: { statuses: [0, 200] },
							expiration: {
								maxEntries: 1200,
								maxAgeSeconds: 60 * 60 * 24 * 60,
								purgeOnQuotaError: true
							}
						}
					}
				]
			},
			devOptions: { enabled: false }
		})
	],
	server: {
		fs: {
			// allow importing repo-level /data (ontology) during dev
			allow: ['..']
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
