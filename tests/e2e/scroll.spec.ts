import { expect, test } from '@playwright/test';

const feedScroll = (page: import('@playwright/test').Page) =>
	page.locator('#feed').evaluate(element => element.scrollTop);

test('restores named container scroll positions on back navigation', async ({ page }) => {
	await page.goto('/playground/scroll');
	await expect(page.getByRole('heading', { name: 'Scroll restoration' })).toBeVisible();

	await page.locator('#feed').evaluate(element => {
		element.scrollTop = 600;
	});
	await expect.poll(() => feedScroll(page)).toBeGreaterThan(100);

	// The in-page link at the top does not need the feed container to be scrolled
	// into view, so the saved position survives the click.
	await page.getByRole('link', { name: /Back to playground home/ }).click();
	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();

	await page.goBack();
	await expect(page.getByRole('heading', { name: 'Scroll restoration' })).toBeVisible();
	await expect.poll(() => feedScroll(page), { timeout: 5000 }).toBeGreaterThan(100);
});
