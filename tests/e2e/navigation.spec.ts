import { expect, test } from '@playwright/test';
import { nav } from './helpers';

test('navigates via a Link and renders the target page', async ({ page }) => {
	await page.goto('/playground');
	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();

	await nav(page).getByRole('link', { name: 'Cache', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Cache: eviction, gcTime, invalidation' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/cache$/);
});

test('browser back restores the previous page', async ({ page }) => {
	await page.goto('/playground');
	await nav(page).getByRole('link', { name: 'Blocker' }).click();
	await expect(page.getByRole('heading', { name: 'Navigation blocking' })).toBeVisible();

	await page.goBack();

	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground$/);
});

test('unknown route renders the 404 page', async ({ page }) => {
	await page.goto('/no-such-route');
	await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
