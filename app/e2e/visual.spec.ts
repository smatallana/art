import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile-layout guardrails (external review round 2). Two layers:
 * - Layout invariants (no sideways scroll, next bar fully reachable) run
 *   everywhere, including CI, on every project.
 * - Pixel baselines are compared only outside CI: CI installs its own
 *   browser build whose font rasterization differs, so pixel-diffing there
 *   would be pure noise. Selection is deterministic for a fresh context
 *   (seed = event count, side flip hashes the pair ids), and artwork
 *   images are masked, so local baselines are stable.
 */

const VIEWPORTS = [
	{ label: 'narrow-320', width: 320, height: 568 },
	{ label: 'iphone-14', width: 390, height: 844 },
	{ label: 'desktop', width: 1280, height: 800 }
];

// Artwork images live on external museum hosts, unreachable from the test
// sandbox. Left alone, every load failure triggers the app's work-replacement
// path and the page churns nondeterministically. Serving a fixed pixel keeps
// the deterministic pair selection AND a stable layout.
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

test.beforeEach(async ({ page }) => {
	await page.route('**/*', (route) => {
		if (route.request().resourceType() === 'image') {
			return route.fulfill({ contentType: 'image/png', body: PIXEL });
		}
		return route.continue();
	});
});

async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

async function checkpoint(page: Page, name: string): Promise<void> {
	if (process.env.CI) return;
	await expect(page).toHaveScreenshot(name, {
		mask: [page.locator('img')],
		animations: 'disabled',
		maxDiffPixelRatio: 0.02
	});
}

for (const vp of VIEWPORTS) {
	test(`layout holds at ${vp.label}: no sideways scroll, reachable next bar`, async ({ page }) => {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.goto('./');

		const choice = page.getByRole('button', { name: 'Choose the first painting' });
		await expect(choice).toBeVisible({ timeout: 15000 });
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await checkpoint(page, `choose-${vp.label}.png`);

		await choice.click();
		const next = page.getByRole('button', { name: 'Next', exact: true });
		await expect(next).toBeVisible();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		const box = await next.boundingBox();
		if (!box) throw new Error('next button reported no bounding box');
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
		expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
		await checkpoint(page, `reveal-${vp.label}.png`);
	});
}
