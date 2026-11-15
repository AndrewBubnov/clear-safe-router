import { expect, test } from '@playwright/test';

test('the shell renders before the deferred chart data', async ({ page }) => {
	await page.goto('/playground/deferred');

	await expect(page.getByRole('heading', { name: 'Deferred render' })).toBeVisible();
	await expect(page.getByText('call 1')).toBeVisible();

	await expect(page.getByText('traffic mix')).toBeVisible({ timeout: 5000 });

	await page.getByRole('button', { name: 'Load again' }).click();

	await expect(page.getByText('call 2')).toBeVisible({ timeout: 5000 });
	await expect(page.getByText('traffic mix')).toBeVisible({ timeout: 5000 });
});
