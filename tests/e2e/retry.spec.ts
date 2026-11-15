import { expect, test } from '@playwright/test';

test('the no-retry twin renders the errorElement', async ({ page }) => {
	await page.goto('/playground/retry-raw');

	await expect(page.getByRole('heading', { name: 'Retry' })).toBeVisible();
	await expect(page.getByText(/Server is having a bad day/)).toBeVisible();
});
