import { expect, test } from '@playwright/test';
import { loaderCalls, loaderDone, nav } from './helpers';

test('hover prefetches loader data for instant navigation', async ({ page }) => {
	await page.goto('/playground');
	await nav(page).getByRole('link', { name: 'Prefetch' }).hover();

	// Wait for the prefetch to *finish* — clicking mid-prefetch aborts it by design
	// and refetches for the navigation instead.
	await expect.poll(() => loaderDone(page, 'slow'), { timeout: 5000 }).toBe(1);

	await nav(page).getByRole('link', { name: 'Prefetch' }).click();

	await expect(page.getByRole('heading', { name: 'Prefetch' })).toBeVisible();
	await expect(page.getByText('Slow payload (call 1)')).toBeVisible();
	expect(await loaderCalls(page, 'slow')).toBe(1);
});

test('prefetch=none does not fetch until click', async ({ page }) => {
	await page.goto('/playground/settings');
	await page
		.getByRole('radiogroup', { name: 'Link prefetch strategy' })
		.getByText('none', { exact: true })
		.click();

	await page.getByRole('navigation', { name: 'Playground' }).getByRole('link', { name: 'Prefetch' }).hover();
	await page.waitForTimeout(400);
	expect(await loaderCalls(page, 'slow')).toBe(0);

	await nav(page).getByRole('link', { name: 'Prefetch' }).click();

	await expect(page.getByRole('heading', { name: 'Prefetch' })).toBeVisible();
	await expect(page.getByText('Slow payload (call 1)')).toBeVisible();
	expect(await loaderCalls(page, 'slow')).toBe(1);
});
