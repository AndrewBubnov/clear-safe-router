import { expect, test } from '@playwright/test';

test('search params update the URL without a navigation', async ({ page }) => {
	await page.goto('/playground/search');
	await expect(page.getByTestId('search-url')).toHaveText('(empty)');

	await page.getByRole('button', { name: 'nike' }).click();

	await expect(page).toHaveURL(/\?brand=nike$/);
	await expect(page.getByTestId('search-url')).toHaveText('brand=nike');
	await expect(page.getByTestId('search-brand')).toHaveText('"nike"');

	await page.getByRole('button', { name: 'nike' }).click();
	await expect(page).toHaveURL(/\/playground\/search$/);
	await expect(page.getByTestId('search-brand')).toHaveText('null');
});

test('multiple keys, arrays and clearing all', async ({ page }) => {
	await page.goto('/playground/search?brand=nike');

	await page.getByRole('button', { name: 'reebok' }).click();
	await expect(page).toHaveURL(/brand=nike&brand=reebok/);
	await expect(page.getByTestId('search-brand')).toHaveText('["nike","reebok"]');

	await page.getByRole('button', { name: 'page=2' }).click();
	await expect(page).toHaveURL(/page=2/);
	await expect(page).toHaveURL(/brand=nike&brand=reebok/);

	await page.getByRole('button', { name: 'Clear all' }).click();
	await expect(page).toHaveURL(/\/playground\/search$/);
	await expect(page.getByTestId('search-url')).toHaveText('(empty)');
});
