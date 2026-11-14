import { expect, test } from '@playwright/test';

test('home renders the playground and navigates to the cache lab', async ({ page }) => {
  await page.goto('/playground');
  await expect(page.getByRole('heading', { name: 'Clear Router Playground' })).toBeVisible();
  await page.getByRole('link', { name: /Cache: eviction/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Cache: eviction, gcTime, invalidation' })).toBeVisible();
  await expect(page.locator('.pg-wrap').getByText('Cache lab payload (call 1)', { exact: true })).toBeVisible();
});

test('dynamic file route handles typed params', async ({ page }) => {
  await page.goto('/playground/cache/product/42');
  await expect(page.getByRole('heading', { name: 'Product 42' })).toBeVisible();
  await expect(page.getByText(/loaded 1 time/)).toBeVisible();
});

test('catch-all handles unknown paths', async ({ page }) => {
  await page.goto('/unknown/path');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('guard redirects anonymous users and lets them in after login', async ({ page }) => {
  await page.goto('/playground/dashboard');
  await expect(page.getByRole('heading', { name: 'Route guards' })).toBeVisible();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: /Try opening dashboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
