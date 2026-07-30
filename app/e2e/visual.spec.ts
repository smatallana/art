import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile-layout guardrails (external review round 2). Two layers:
 * - Layout invariants (no sideways scroll, next bar fully reachable) run
 *   everywhere, including CI, on every project.
 * - Pixel baselines are compared only outside CI: CI installs its own
 *   browser build whose font rasterization differs, so pixel-diffing there
 *   would be pure noise. Selection is deterministic for a fresh context
 *   (seed = event count, side flip hashes the pair ids), artwork images
 *   are masked, and the catalog is pinned to the precached bootstrap (an
 *   empty shard list below) — at full-catalog scale the shard-arrival race
 *   otherwise changes which works the session pool holds run to run.
 * Baselines depend on the committed bootstrap.json — regenerate after
 * catalog rebuilds: npx playwright test e2e/visual.spec.ts --update-snapshots
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

// Pin the catalog to the deterministic bootstrap: an index with no shards
// makes the session pool exactly the committed bootstrap works, every run.
const catalogDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/catalog');
const realIndex = JSON.parse(readFileSync(path.join(catalogDir, 'index.json'), 'utf8'));
const bootstrapCount = (
	JSON.parse(readFileSync(path.join(catalogDir, 'bootstrap.json'), 'utf8')) as unknown[]
).length;
const PINNED_INDEX = JSON.stringify({ ...realIndex, count: bootstrapCount, shards: [] });

test.beforeEach(async ({ page }) => {
	await page.route('**/*', (route) => {
		if (route.request().resourceType() === 'image') {
			return route.fulfill({ contentType: 'image/png', body: PIXEL });
		}
		if (route.request().url().endsWith('/catalog/index.json')) {
			return route.fulfill({ contentType: 'application/json', body: PINNED_INDEX });
		}
		return route.continue();
	});
});

async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

async function checkpoint(page: Page, name: string, maskImages = true): Promise<void> {
	if (process.env.CI) return;
	await expect(page).toHaveScreenshot(name, {
		// The welcome's hero backdrop sits UNDER the foreground text — masking
		// it would paint over the whole screen, so that baseline relies on the
		// deterministic fixed-pixel image instead.
		mask: maskImages ? [page.locator('img')] : [],
		animations: 'disabled',
		maxDiffPixelRatio: 0.02
	});
}

for (const vp of VIEWPORTS) {
	test(`welcome first-run layout at ${vp.label}`, async ({ page }) => {
		// No welcomed flag: this is the one surface a fresh device holds on.
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.goto('./');

		const begin = page.getByRole('button', { name: 'Begin', exact: true });
		await expect(begin).toBeVisible();
		// The hero backdrop must settle (fixed pixel) before the screenshot.
		await expect(page.locator('.hero img')).toBeVisible({ timeout: 15000 });
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		const box = await begin.boundingBox();
		if (!box) throw new Error('begin button reported no bounding box');
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
		expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
		await checkpoint(page, `welcome-${vp.label}.png`, false);
	});
}

for (const vp of VIEWPORTS) {
	test(`layout holds at ${vp.label}: no sideways scroll, reachable next bar`, async ({ page }) => {
		// Session layout cases pre-acknowledge the welcome; the flag is pure
		// localStorage (no events), so pair selection stays seed-stable.
		await page.addInitScript(() => localStorage.setItem('beholder-welcomed', '1'));
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
