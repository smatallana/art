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

	// Default reveal is compact: Save is the only visible action; strength
	// and Remember live inside the collapsed "Add context" fold (tramo 9).
	await expect(page.getByRole('button', { name: /Remember this/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

	// React + remember inside the fold (no typing anywhere).
	await page.getByText('Add context to this choice').click();
	await page.getByRole('button', { name: 'Intrigued' }).click();
	await expect(page.getByRole('button', { name: /Remember this/ })).toBeVisible();

	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();

	// Progress advanced to 2 of N.
	await expect(page.getByText(/2 of \d+/)).toBeVisible();

	// The saved work appears on the Saved page; the field notebook only
	// exists once a Snap photo has been archived (never on a fresh profile).
	await page.goto('./saved/');
	await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 15000 });
	await expect(page.getByText('Field notebook')).toHaveCount(0);
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
	// Past sessions appear once a session_end exists (none yet mid-session);
	// the artists section must never phrase low exposure as low affinity.
	await expect(page.getByText(/low affinity/)).toHaveCount(0);
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
	// Walk the full 6-pair first session on a fresh profile (calibration mode).
	for (let i = 0; i < 6; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	// The first summary offers the sharpen continuation; the NEXT session
	// would still be calibration, so "Test this pattern" must not appear.
	await expect(page.getByRole('button', { name: /Sharpen this read/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'See my eye' })).toBeVisible();
	await expect(page.getByText('Test this pattern')).toHaveCount(0);
	await expect(page.getByText(/can test/)).toHaveCount(0);
	// The close recommendations appear WITHOUT claiming a confident read:
	// during calibration the heading is the "early possibilities" variant.
	await expect(page.getByText('Early possibilities for your next visit')).toBeVisible();
	await expect(page.getByText('For your next visit', { exact: true })).toHaveCount(0);
	await expect(page.getByText(/First guesses from your choices/)).toBeVisible();
	// Progress toward value is stated in real numbers.
	await expect(page.getByText(/6 of 40 calibration choices/)).toBeVisible();
	await expect(page.getByText(/2 more choices until your first profile read/)).toBeVisible();
});

test('finishing early after three answers earns a summary, not an exit', async ({ page }) => {
	await page.goto('./');
	for (let i = 0; i < 3; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	await page.getByRole('button', { name: 'Finish session' }).click();
	// Still on the session page: the low-confidence summary renders.
	await expect(page.getByText(/Ended early — your 3 choices still count/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'See my eye' })).toBeVisible();
	// Leaving from here lands on the profile, where the session's frozen
	// conclusion is already listed under Past sessions.
	await page.getByRole('button', { name: 'See my eye' }).click();
	await expect(page).toHaveURL(/\/profile\/$/);
	await page.getByText('Past sessions').click();
	await expect(page.getByText(/3 answered/)).toBeVisible();
});

test('the sharpen continuation starts a 4-pair sitting', async ({ page }) => {
	await page.goto('./');
	for (let i = 0; i < 6; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	await page.getByRole('button', { name: /Sharpen this read/ }).click();
	await expect(page.getByText(/1 of 4/)).toBeVisible({ timeout: 15000 });
});

test('the overflow menu skips and reports a problem without consuming progress', async ({
	page
}) => {
	await page.goto('./');
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});
	// Skip via the menu: progress stays, a fresh pair appears.
	await page.getByRole('button', { name: 'More options' }).click();
	await page.getByRole('menuitem', { name: 'Skip this pair' }).click();
	await expect(page.getByText(/1 of \d+/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();
	// Report a problem: reason step, then advance — still unanswered.
	await page.getByRole('button', { name: 'More options' }).click();
	await page.getByRole('menuitem', { name: 'Report a problem' }).click();
	await page.getByRole('menuitem', { name: 'Hard to see the image' }).click();
	await expect(page.getByText(/1 of \d+/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();
	// Escape closes the menu.
	await page.getByRole('button', { name: 'More options' }).click();
	await expect(page.getByRole('menu')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toHaveCount(0);
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

test('the seen gallery accumulates every shown work', async ({ page }) => {
	await page.goto('./');
	for (let i = 0; i < 6; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click({ timeout: 15000 });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	// The summary states the collector line...
	await expect(page.getByText(/Your gallery grew to 12 works seen/)).toBeVisible();
	// ...and the Saved page holds the accumulated gallery, chosen marks included.
	await page.goto('./saved/');
	await expect(page.getByText('Works you have seen')).toBeVisible();
	await expect(page.locator('.seen-grid li')).toHaveCount(12);
	await expect(page.getByText(/12 of \d+ works in the collection/)).toBeVisible();
	await expect(page.locator('.seen-mark').first()).toBeVisible();
});
