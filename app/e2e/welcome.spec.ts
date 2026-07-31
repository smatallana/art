import { expect, test } from '@playwright/test';

/**
 * First-run welcome (tramo 8 — first real-user testing). A fresh device
 * must learn what Beholder IS before being asked to choose between two
 * unexplained paintings. The welcome shows exactly once: Begin (guest)
 * enters the session, and the device never sees it again. Acknowledging
 * it writes ONLY a localStorage flag — no events — so session selection
 * stays deterministic for a fresh profile (seed = event count).
 */

test('a fresh device sees the welcome; Begin enters the session; it never returns', async ({
	page
}) => {
	await page.goto('./');

	// Identity + purpose come first — not a pair of paintings.
	await expect(page.getByRole('heading', { name: 'Beholder' })).toBeVisible();
	await expect(page.getByText(/Choose between pairs of paintings/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Begin', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});

	// Home now forwards straight into the session — the welcome is spent.
	await page.goto('./');
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});
	await expect(page.getByText(/Choose between pairs of paintings/)).toHaveCount(0);
});

test('choosing ES on the welcome switches the app to Spanish and persists', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'ES', exact: true }).click();
	// The welcome itself switches immediately.
	await expect(page.getByText(/Elige entre parejas de cuadros/)).toBeVisible();
	await page.getByRole('button', { name: 'Empezar', exact: true }).click();
	await expect(page.getByText('¿Cuál te atrae?')).toBeVisible({ timeout: 15000 });
	// The choice persists across a reload.
	await page.reload();
	await expect(page.getByText('¿Cuál te atrae?')).toBeVisible({ timeout: 15000 });
});

test('a device that already began skips the welcome entirely', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('beholder-welcomed', '1'));
	await page.goto('./');
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});
});

test('the first pairs carry the purpose hint, then it retires', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('beholder-welcomed', '1'));
	await page.goto('./');

	// First two lifetime answers: the in-flow hint explains what a choice does.
	const hint = page.getByText(/every answer teaches Beholder your eye/);
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible({
		timeout: 15000
	});
	await expect(hint).toBeVisible();
	for (let i = 0; i < 2; i++) {
		await page.getByRole('button', { name: 'Choose the first painting' }).click();
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	await expect(page.getByRole('button', { name: 'Choose the first painting' })).toBeVisible();
	await expect(hint).toHaveCount(0);
});
