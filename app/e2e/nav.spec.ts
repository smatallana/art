import { expect, test } from '@playwright/test';

/**
 * Back navigation E2E (real-user finding: an installed PWA has no browser
 * chrome, and the drill-in pages had no way back). The BackBar walks real
 * in-app history when it exists and falls back to the parent route on a
 * cold deep link — never out of the app.
 */

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('beholder-welcomed', '1'));
});

test('work detail from the session summary goes back to the summary', async ({ page }) => {
	await page.goto('./');
	for (let i = 0; i < 6; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	// The summary's "next visit" cards link into /work — the worst previous
	// dead end: leaving lost the summary with no way back.
	await expect(page.getByText(/next visit/)).toBeVisible();
	await page.locator('.next-row a').first().click();
	await expect(page).toHaveURL(/\/work\//);
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/session\/$/);
	await expect(page.getByText(/next visit/)).toBeVisible();
});

test('a cold deep link into a work falls back to Discover, not out of the app', async ({
	page
}) => {
	// Direct load: no in-app history exists, so Back must use the fallback
	// parent route instead of history.back() (which would exit the PWA).
	await page.goto('./work/aic-100191/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/discover\/$/);
});

test('settings goes back to the profile', async ({ page }) => {
	await page.goto('./profile/');
	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings\/$/);
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page).toHaveURL(/\/profile\/$/);
});
