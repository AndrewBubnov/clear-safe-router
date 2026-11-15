import { MantineProvider } from '@mantine/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Router, routerRuntime } from '../src/index';
import { routeTree } from './routeTree.gen';
import { resetRouterState, setRouterConfig } from '../src/runtime';
import { getCallCount } from './pages/api';

vi.hoisted(() => {
	window.matchMedia ??= ((query: string) => ({
		matches: false, media: query, onchange: null,
		addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

afterEach(() => { cleanup(); resetRouterState(); });

it('nest loader runs once across item navigation (real route tree)', async () => {
	setRouterConfig(routeTree);
	window.history.replaceState(null, '', '/playground/nest/nest-1');
	render(<MantineProvider><Router routes={routeTree} /></MantineProvider>);
	await screen.findByRole('heading', { name: /Nest nest-1/ });
	await act(async () => { await routerRuntime.navigate('/playground/nest'); });
	expect(getCallCount('nest-nest-1')).toBe(1);

	await act(async () => { await routerRuntime.navigate('/playground/nest/nest-1/item/item-1'); });
	expect(getCallCount('nest-nest-1')).toBe(1);
	expect(getCallCount('nest-nest-1-item-1')).toBe(1);

	await act(async () => { await routerRuntime.navigate('/playground/nest/nest-1'); });
	expect(getCallCount('nest-nest-1')).toBe(1);
	expect(getCallCount('nest-nest-1-item-1')).toBe(1);
});
