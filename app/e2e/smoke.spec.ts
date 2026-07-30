import { expect, test } from '@playwright/test';

test('a cold visitor sees the welcome; Begin opens a session with two paintings', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto('./');
	await expect(page).toHaveTitle(/Beholder/);
	// First run: the welcome introduces the app; Begin enters as a guest and
	// home forwards into the session as soon as the pool is usable.
	const begin = page.getByRole('button', { name: 'Begin', exact: true });
	await expect(begin).toBeVisible();
	await begin.click();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});
	expect(errors).toEqual([]);
});

test('PWA manifest is linked and resolvable', async ({ page, request }) => {
	await page.goto('./');
	// Resolve the raw attribute against the request fixture's configured
	// baseURL — never against the live document URL: after the welcome is
	// acknowledged the home → /session/ SPA redirect moves the document base
	// (DOM href properties re-resolve lazily), which intermittently produced
	// /session/manifest.webmanifest.
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBeTruthy();
	const res = await request.get(href!);
	expect(res.ok()).toBeTruthy();
	const manifest = await res.json();
	expect(manifest.name).toBe('Beholder');
	expect(manifest.display).toBe('standalone');
	expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);
});

test('theme color and safe-area viewport are configured for iOS', async ({ page }) => {
	await page.goto('./');
	const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(viewport).toContain('viewport-fit=cover');
	const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute('content');
	expect(themeColor).toBeTruthy();
});
