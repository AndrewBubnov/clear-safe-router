import { expect, test } from '@playwright/test';

test('a fresh cache entry is reused on revisit', async ({ page }) => {
	await page.goto('/playground/cache');
	const payload = page.locator('.pg-wrap').getByText('Cache lab payload (call 1)', { exact: true });
	await expect(payload).toBeVisible();

	// prefetch="none" on this link keeps the loader counter honest.
	await page.getByRole('link', { name: 'Open the heavy page' }).click();
	await expect(page.getByRole('heading', { name: 'Heavy page (gcTime)' })).toBeVisible();
	await expect(page.getByText(/Heavy payload \(visit 1\)/)).toBeVisible();

	await page.goBack();

	await expect(page).toHaveURL(/\/playground\/cache$/);
	// The lab entry has staleTime=10s: coming back within the window reuses it.
	await expect(payload).toBeVisible();
});
