import { expect, test } from '@playwright/test';

test('route action submits and invalidates the list', async ({ page }) => {
	await page.goto('/playground/actions');
	await expect(page.getByRole('heading', { name: 'Actions + invalidation' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Notes (2)' })).toBeVisible();

	await page.getByLabel('Note text').fill('E2E note');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByRole('heading', { name: 'Notes (3)' })).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: 'E2E note' })).toBeVisible();
});
