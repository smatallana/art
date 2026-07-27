import { expect, test } from '@playwright/test';

test('home page renders the Beholder shell', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto('/');
	await expect(page).toHaveTitle(/Beholder/);
	await expect(page.getByRole('heading', { level: 1, name: 'Beholder' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('PWA manifest is linked and resolvable', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBeTruthy();
	const res = await request.get(new URL(href!, page.url()).toString());
	expect(res.ok()).toBeTruthy();
	const manifest = await res.json();
	expect(manifest.name).toBe('Beholder');
	expect(manifest.display).toBe('standalone');
	expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);
});

test('theme color and safe-area viewport are configured for iOS', async ({ page }) => {
	await page.goto('/');
	const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(viewport).toContain('viewport-fit=cover');
	const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute('content');
	expect(themeColor).toBeTruthy();
});
