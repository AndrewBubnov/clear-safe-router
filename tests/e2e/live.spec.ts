import { expect, test } from '@playwright/test';

test('polling revalidates the active route', async ({ page }) => {
	await page.goto('/playground/live');
	await expect(page.getByRole('heading', { name: 'Polling' })).toBeVisible();

	const tick = page.getByText(/^tick: \d+$/);
	await expect(tick).toHaveText('tick: 1');

	await expect
		.poll(async () => tick.textContent(), { timeout: 10_000 })
		.not.toBe('tick: 1');
});

test('polling stops when the route is left', async ({ page }) => {
	await page.goto('/playground/live');
	const tick = page.getByText(/^tick: \d+$/);
	await expect(tick).toHaveText('tick: 1');

	await page.getByRole('link', { name: /Back to playground home/ }).click();
	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();

	const calls = await page.evaluate(() => (window as unknown as { __loaderCalls?: Record<string, number> }).__loaderCalls?.live ?? 0);
	await page.waitForTimeout(4000);
	expect(
		await page.evaluate(() => (window as unknown as { __loaderCalls?: Record<string, number> }).__loaderCalls?.live ?? 0)
	).toBe(calls);
});
