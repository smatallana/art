import { expect, test } from '@playwright/test';

/**
 * Core game-loop E2E against the committed dev-fixture catalog.
 * Covers acceptance criteria: interact without typing, responses persist,
 * close-and-return resumes, next selection adapts (no repeated pair).
 */

test('full session flow: choose, reveal, react, save, advance', async ({ page }) => {
	await page.goto('./');
	const start = page.getByRole('link', { name: /begin a session|continue your session/i });
	await expect(start).toBeVisible({ timeout: 15000 });
	await start.click();

	// Pair is shown — two artwork buttons.
	const choiceA = page.getByRole('button', { name: 'Choose the first painting' });
	await expect(choiceA).toBeVisible({ timeout: 15000 });
	await choiceA.click();

	// Reveal: title, artist line, attribution, next button.
	await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
	await expect(page.getByText(/CC0/i).first()).toBeVisible();

	// React + save (no typing anywhere).
	await page.getByRole('button', { name: 'Intrigued' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();

	// Progress advanced to 2 of N.
	await expect(page.getByText(/2 of \d+/)).toBeVisible();

	// The saved work appears on the Saved page.
	await page.goto('./saved/');
	await expect(page.getByRole('listitem').first()).toBeVisible();
});

test('answers persist across reload and session resumes in place', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('link', { name: /begin a session|continue/i }).click();
	await page.getByRole('button', { name: 'Choose the first painting' }).click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page.getByRole('button', { name: 'Choose the second painting' }).click();

	// Kill the page mid-reveal and come back.
	await page.reload();
	// Resumed session: either still in reveal-flow position or choosing pair 3;
	// the progress counter must not reset to 1.
	await expect(page.getByText(/(2|3) of \d+/)).toBeVisible({ timeout: 15000 });

	// Home shows recorded history after finishing the visit.
	await page.goto('./');
	await expect(page.getByText(/choices recorded/)).toBeVisible();
});

test('pairs do not repeat within a session', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('link', { name: /begin a session|continue/i }).click();

	const seen = new Set<string>();
	for (let i = 0; i < 5; i++) {
		const imgs = page.locator('.pair img');
		await expect(imgs).toHaveCount(2, { timeout: 15000 });
		const srcs = [await imgs.nth(0).getAttribute('src'), await imgs.nth(1).getAttribute('src')]
			.sort()
			.join('::');
		expect(seen.has(srcs)).toBe(false);
		seen.add(srcs);
		await page.getByRole('button', { name: 'Choose the first painting' }).click();
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
});

test('export produces a JSON download without any typing', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('link', { name: /begin a session|continue/i }).click();
	await page.getByRole('button', { name: 'Choose the first painting' }).click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();

	await page.goto('./settings/');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /export my data/i }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/beholder-export-.*\.json/);
});
