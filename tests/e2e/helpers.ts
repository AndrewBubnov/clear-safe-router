import type { Page } from '@playwright/test';

export const loaderCalls = (page: Page, key: string) =>
	page.evaluate(k => (window as unknown as { __loaderCalls?: Record<string, number> }).__loaderCalls?.[k] ?? 0, key);

export const loaderDone = (page: Page, key: string) =>
	page.evaluate(k => (window as unknown as { __loaderDone?: Record<string, number> }).__loaderDone?.[k] ?? 0, key);

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Playground' });
