import { defineConfig, devices } from '@playwright/test';

/**
 * E2E targets mirror the priority order from discovery:
 * iPhone Safari first (WebKit + iPhone viewport), then desktop Chromium.
 * WebKit is installed in CI; locally only Chromium may be present, so the
 * webkit project is skipped gracefully when the browser is missing.
 */
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		// Mirror the deployed shape: the app lives under BASE_PATH (/art on Pages).
		baseURL: `http://localhost:4173${process.env.BASE_PATH ?? ''}/`,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'npm run preview -- --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	},
	projects: [
		{
			name: 'iphone-webkit',
			use: { ...devices['iPhone 14'] }
		},
		{
			name: 'desktop-chromium',
			use: {
				...devices['Desktop Chrome'],
				// The dev sandbox preinstalls one Chromium build; CI installs
				// the matching browsers itself, so this only applies locally.
				launchOptions: process.env.PW_CHROMIUM_PATH
					? { executablePath: process.env.PW_CHROMIUM_PATH }
					: {}
			}
		}
	]
});
