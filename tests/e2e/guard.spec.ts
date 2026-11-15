import { expect, test } from '@playwright/test';

test('guard redirects anonymous users and passes the origin via state', async ({ page }) => {
	await page.goto('/playground/dashboard');

	await expect(page.getByRole('heading', { name: 'Route guards' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/guard$/);
	await expect(page.getByText(/\/playground\/dashboard requires login/)).toBeVisible();

	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.locator('.pg-badge', { hasText: /^authorized$/ })).toBeVisible();

	await page.getByRole('link', { name: /Try opening dashboard/ }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/dashboard$/);
});
