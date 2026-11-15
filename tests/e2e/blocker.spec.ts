import { expect, test } from '@playwright/test';
import { nav } from './helpers';

test('blocks Link navigation while dirty, cancel stays on the page', async ({ page }) => {
	await page.goto('/playground/blocker');
	await page.getByLabel('Unsaved form text').fill('unsaved');
	await expect(page.getByText('blocker: charged')).toBeVisible();

	await page.getByRole('link', { name: /Try leaving via this link/ }).click();

	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/blocker$/);

	await page.getByRole('button', { name: 'Stay' }).click();

	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByRole('heading', { name: 'Navigation blocking' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/blocker$/);
});

test('confirm completes the blocked navigation', async ({ page }) => {
	await page.goto('/playground/blocker');
	await page.getByLabel('Unsaved form text').fill('unsaved');
	await expect(page.getByText('blocker: charged')).toBeVisible();

	await page.getByRole('link', { name: /Try leaving via this link/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.getByRole('button', { name: 'Leave' }).click();

	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();
	await expect(page).toHaveURL(/\/playground$/);
});

test('browser back is blocked without adding history entries', async ({ page }) => {
	await page.goto('/playground');
	await nav(page).getByRole('link', { name: 'Blocker' }).click();
	await expect(page.getByRole('heading', { name: 'Navigation blocking' })).toBeVisible();

	await page.getByLabel('Unsaved form text').fill('unsaved');
	await expect(page.getByText('blocker: charged')).toBeVisible();

	const historyLength = await page.evaluate(() => history.length);

	await page.evaluate(() => history.back());
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/blocker$/);
	expect(await page.evaluate(() => history.length)).toBe(historyLength);

	await page.evaluate(() => history.back());
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(/\/playground\/blocker$/);
	expect(await page.evaluate(() => history.length)).toBe(historyLength);

	await page.getByRole('button', { name: 'Leave' }).click();
	await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();
});
