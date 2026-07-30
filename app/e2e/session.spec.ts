import { expect, test } from '@playwright/test';

/**
 * Core game-loop E2E against the committed catalog.
 * Covers acceptance criteria: interact without typing, responses persist,
 * close-and-return resumes, next selection adapts (no repeated pair).
 * The first-run welcome is pre-acknowledged below so the home route forwards
 * straight into an auto-started session (the welcome itself has its own
 * spec, welcome.spec.ts).
 */

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('beholder-welcomed', '1'));
});

test('full session flow: choose, reveal, react, save, advance', async ({ page }) => {
	await page.goto('./');

	// Pair is shown — two artwork buttons (home forwards into the session).
	const choiceA = page.getByRole('button', { name: 'Choose the first painting' });
	await expect(choiceA).toBeVisible({ timeout: 15000 });
	await choiceA.click();

	// Reveal: title heading; attribution sits one tap away under the
	// "About this work" fold (in-copyright attribution stays inline).
	// The three-source catalog phrases rights three ways — CC0 (museum
	// APIs), "Public domain" (Wikimedia canon), © (linked landmarks).
	await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
	await page.getByText('About this work').click();
	await expect(page.getByText(/CC0|public domain|©/i).first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'View at museum' })).toBeVisible();

	// React + save (no typing anywhere). Reaction chips live inside the
	// collapsed "Add context to this choice" fold — open it first.
	await page.getByText('Add context to this choice').click();
	await page.getByRole('button', { name: 'Intrigued' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();

	// Progress advanced to 2 of N.
	await expect(page.getByText(/2 of \d+/)).toBeVisible();

	// The saved work appears on the Saved page.
	await page.goto('./saved/');
	await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 15000 });
});

test('answers persist across reload and session resumes in place', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page.getByRole('button', { name: 'Choose the second painting' }).click();
	// Persistence is guaranteed once the reveal renders (record() is awaited
	// before the phase flips) — wait for it before killing the page.
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();

	// Kill the page mid-reveal and come back.
	await page.reload();
	// Resumed session: either still in reveal-flow position or choosing pair 3;
	// the progress counter must not reset to 1.
	await expect(page.getByText(/(2|3) of \d+/)).toBeVisible({ timeout: 15000 });

	// The profile shows recorded history.
	await page.goto('./profile/');
	await expect(page.getByText(/Built from \d+ recorded/)).toBeVisible({ timeout: 15000 });
});

test('pairs do not repeat within a session', async ({ page }) => {
	await page.goto('./');

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

test('a finished first session is honest: no targeting promise during calibration', async ({
	page
}) => {
	await page.goto('./');
	// Walk a full 12-pair session on a fresh profile (calibration mode).
	for (let i = 0; i < 12; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	// The NEXT session would still be calibration: the targeted selector
	// cannot honor "Test this pattern", so the copy must not promise it.
	await expect(page.getByRole('button', { name: 'Another session' })).toBeVisible();
	await expect(page.getByText('Test this pattern')).toHaveCount(0);
	await expect(page.getByText(/can test/)).toHaveCount(0);
});

test('export produces a JSON download without any typing', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
	await page.getByRole('button', { name: 'Next', exact: true }).click();

	await page.goto('./settings/');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /export my data/i }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/beholder-export-.*\.json/);
});
