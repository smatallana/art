import { defineConfig, devices } from '@playwright/test';

/**
 * Production smoke suite: runs against the LIVE deployed URL with a clean
 * browser profile after every Pages deploy (smoke-prod.yml). This is the
 * test the local E2E suite cannot be — real CDN, real service worker, real
 * museum image GETs, cold IndexedDB.
 */
export default defineConfig({
	testDir: './e2e-prod',
	fullyParallel: false,
	retries: 1,
	reporter: [['list']],
	timeout: 60_000,
	use: {
		baseURL: process.env.PROD_URL ?? 'https://smatallana.github.io/art/',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }
	]
});
