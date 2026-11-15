import { expect, test } from '@playwright/test';

test('nested routes render params at every level and keep layouts mounted', async ({ page }) => {
	await page.goto('/playground/nest');
	await expect(page.getByRole('heading', { name: 'Nested routes' })).toBeVisible();

	const nestLink = page.getByRole('link', { name: /^nest-\d+$/ }).first();
	const nestName = (await nestLink.textContent())!.trim();
	await nestLink.click();

	await expect(page.getByRole('heading', { name: `Nest ${nestName}` })).toBeVisible();
	await expect(page.getByText(new RegExp(`Nest ${nestName} \\(loaded 1 time`))).toBeVisible();

	await page.getByRole('button', { name: 'Increment' }).click();
	await expect(page.getByText('count: 1')).toBeVisible();

	const itemLink = page.getByRole('link', { name: /^item-\d+$/ }).first();
	const itemName = (await itemLink.textContent())!.trim();
	await itemLink.click();

	await expect(page.getByRole('heading', { name: `Item ${itemName} of nest ${nestName}` })).toBeVisible();
	await expect(page.getByText('Nested layout')).toBeVisible();
	// The section layout was not remounted on child navigation.
	await expect(page.getByText('count: 1')).toBeVisible();

	await page.getByRole('link', { name: `Back to nest ${nestName}` }).click();
	await expect(page.getByRole('heading', { name: `Nest ${nestName}` })).toBeVisible();
	await expect(page.getByText('count: 1')).toBeVisible();
});
