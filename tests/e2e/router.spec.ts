import { expect, test } from '@playwright/test';

test('generated file routes navigate and load route data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Typed Router' })).toBeVisible();
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { name: 'Generated file route is working' })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL('/');
});

test('dynamic file route handles typed params', async ({ page }) => {
  await page.goto('/members/42');
  await expect(page.getByText('42: 42')).toBeVisible();
});

test('unknown path is handled by the generated catch-all route', async ({ page }) => {
  await page.goto('/unknown/path');
  await expect(page.getByRole('heading', { name: 'Catch all' })).toBeVisible();
  await expect(page.getByText('path: unknown/path')).toBeVisible();
});

test('browser back reuses the generated route tree', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Typed Router' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
