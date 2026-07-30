import { expect, test, type Page } from '@playwright/test';

/**
 * The one test that matters after every deploy: a completely cold visitor
 * on the real production URL must land on the first-run welcome, Begin as
 * a guest, reach two actually-rendered paintings, make a choice, see the
 * reveal, and survive a reload — on WebKit and Chromium. Fails red if the
 * live product regresses.
 */

async function expectPairRendered(page: Page): Promise<void> {
	const choiceA = page.getByRole('button', { name: 'Choose the first painting' });
	await expect(choiceA).toBeVisible({ timeout: 20000 });
	// Both images must actually decode — metadata alone is not "art on screen".
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const imgs = [...document.querySelectorAll<HTMLImageElement>('.pair img')];
					return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
				}),
			{ timeout: 30000 }
		)
		.toBe(true);
}

test('cold start reaches a working session with real images', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto('./');
	// First-run welcome: purpose before paintings, then guest entry.
	const begin = page.getByRole('button', { name: 'Begin', exact: true });
	await expect(begin).toBeVisible({ timeout: 20000 });
	await begin.click();
	await expectPairRendered(page);

	await page.getByRole('button', { name: 'Choose the first painting' }).click();
	await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 15000 });
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();

	// Persistence: reload mid-session, progress must not reset to a fresh app.
	await page.reload();
	await expect(page.getByText(/(2|1) of \d+/)).toBeVisible({ timeout: 20000 });

	expect(errors).toEqual([]);
});

test('catalog endpoints serve the deployed generation', async ({ request, baseURL }) => {
	const index = await request.get(new URL('catalog/index.json', baseURL).toString());
	expect(index.ok()).toBeTruthy();
	const parsed = await index.json();
	expect(parsed.count).toBeGreaterThan(1000);
	const bootstrap = await request.get(new URL('catalog/bootstrap.json', baseURL).toString());
	expect(bootstrap.ok()).toBeTruthy();
	expect((await bootstrap.json()).length).toBeGreaterThanOrEqual(50);
});
