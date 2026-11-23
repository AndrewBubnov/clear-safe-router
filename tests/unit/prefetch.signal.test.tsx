import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Outlet, Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';
import { cache, routeKey, snapshot } from '../../src/core/state';
import { runLoader } from '../../src/core/cache';
import type { FileRouteOptions, RouteMatch, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
	id, path, options, children,
	useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const loc = (pathname = '/test', search = '') => ({ pathname, search });
const matchFor = (options: FileRouteOptions<any>): RouteMatch => ({
	route: node('/test', '/test', options),
	params: {},
	key: routeKey(node('/test', '/test', options), loc()),
}) as unknown as RouteMatch;

afterEach(() => {
	cleanup();
	resetRouterState();
	vi.restoreAllMocks();
	window.history.replaceState(null, '', '/');
});

describe('beforeLoad receives the navigation abort signal', () => {
	it('passes an AbortSignal to the guard and aborts it when the navigation is superseded', async () => {
		let guardSignal: AbortSignal | undefined;
		let releaseGuard: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => { releaseGuard = resolve; });
		const tree = root([
			node('/', '/', { component: () => <p>home</p> }),
			node('/slow', '/slow', {
				beforeLoad: async ({ signal }) => {
					guardSignal = signal;
					await blocked;
				},
				loader: () => 'slow data',
				component: () => <p>slow</p>,
			}),
			node('/other', '/other', { component: () => <p>other</p> }),
		]);
		window.history.replaceState(null, '', '/');
		setRouterConfig(tree);
		render(<Router routes={tree} />);
		await screen.findByText('home');

		const first = routerRuntime.navigate('/slow');
		await vi.waitFor(() => expect(guardSignal).toBeDefined());
		expect(guardSignal!.aborted).toBe(false);

		await act(async () => { await routerRuntime.navigate('/other'); });
		expect(guardSignal!.aborted).toBe(true);
		releaseGuard!();
		await act(async () => { await first; });
		expect(snapshot().location.pathname).toBe('/other');
	});
});

describe('runLoader refuses pre-aborted callers', () => {
	it('does not create a flight or call the loader when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const loader = vi.fn(async () => 'data');
		await runLoader(matchFor({ loader }), loc(), controller.signal);
		expect(loader).not.toHaveBeenCalled();
		expect([...cache.keys()]).toEqual([]);
	});

	it('keeps the cache clean when a prefetch attempt is aborted mid-flight', async () => {
		let release: ((value: string) => void) | undefined;
		const loader = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
		const tree = root([node('/target', '/target', { loader, component: () => <p>target</p> })]);
		setRouterConfig(tree);
		const attempt = new AbortController();
		const prefetchPromise = routerRuntime.prefetch('/target', attempt.signal);
		await vi.waitFor(() => expect(loader).toHaveBeenCalled());
		attempt.abort();
		release!('late data');
		await act(async () => { await prefetchPromise; });
		expect([...cache.keys()].filter((key) => key.includes('/target'))).toEqual([]);
	});
});

describe('prefetch queue skips aborted attempts on dequeue', () => {
	it('never starts a queued attempt whose signal died while waiting', async () => {
		const loader = vi.fn(async () => 'data');
		const tree = root([
			node('/', '/', { component: () => <p>home</p> }),
			node('/queued', '/queued', { loader, component: () => <p>queued</p> }),
		]);
		window.history.replaceState(null, '', '/');
		setRouterConfig(tree);
		render(<Router routes={tree} />);
		await screen.findByText('home');

		// Fill the concurrency budget (4) so the fifth attempt stays queued.
		const attempts = Array.from({ length: 5 }, () => new AbortController());
		void routerRuntime.prefetch('/queued', attempts[0]!.signal);
		await vi.waitFor(() => expect(loader).toHaveBeenCalled());
		loader.mockClear();
		attempts.slice(1, 4).forEach((attempt) => { void routerRuntime.prefetch('/queued', attempt.signal); });
		const queued = attempts[4]!;
		void routerRuntime.prefetch('/queued', queued.signal);
		queued.abort();
		await act(async () => { await Promise.allSettled(attempts.map((attempt) => routerRuntime.prefetch('/queued', attempt.signal))); });
		expect(loader).not.toHaveBeenCalled();
	});
});

describe('canonical cache keys', () => {
	const route = node('/list', '/list', {});

	it('sorts search parameters by name, then by value', () => {
		expect(routeKey(route, loc('/list', '?tag=b&tag=a'))).toBe(routeKey(route, loc('/list', '?tag=a&tag=b')));
		expect(routeKey(route, loc('/list', '?x=2&x=1'))).toBe(routeKey(route, loc('/list', '?x=1&x=2')));
	});

	it('collapses an empty or bare search to no query at all', () => {
		expect(routeKey(route, loc('/list', '?'))).toBe(routeKey(route, loc('/list', '')));
	});
});

describe('invalidate canonicalizes the target', () => {
	it('runs the loader once for a trailing-slash target', async () => {
		const loader = vi.fn(async () => 'data');
		const tree = root([
			node('/', '/', { component: () => <p>home</p> }),
			node('/users/$id', '/users/:id', { loader, component: () => <p>user</p> }),
		]);
		window.history.replaceState(null, '', '/');
		setRouterConfig(tree);
		render(<Router routes={tree} />);
		await act(async () => { await routerRuntime.navigate('/users/1'); });
		await screen.findByText('user');
		loader.mockClear();

		await act(async () => { await routerRuntime.invalidate('/users/1/'); });
		expect(loader).toHaveBeenCalledTimes(1);
	});
});

describe('prefetch signal reaches guards', () => {
	it('aborts in-flight guard work when the attempt is aborted', async () => {
		let guardSignal: AbortSignal | undefined;
		let releaseGuard: (() => void) | undefined;
		const blocked = new Promise<void>((resolve) => { releaseGuard = resolve; });
		const loader = vi.fn(async () => 'data');
		const tree = root([
			node('/', '/', { component: () => <p>home</p> }),
			node('/guarded', '/guarded', {
				beforeLoad: async ({ signal }) => {
					guardSignal = signal;
					await blocked;
				},
				loader,
				component: () => <p>guarded</p>,
			}),
		]);
		window.history.replaceState(null, '', '/');
		setRouterConfig(tree);
		render(<Router routes={tree} />);
		await screen.findByText('home');

		const attempt = new AbortController();
		const prefetchPromise = routerRuntime.prefetch('/guarded', attempt.signal);
		await vi.waitFor(() => expect(guardSignal).toBeDefined());
		attempt.abort();
		releaseGuard!();
		await act(async () => { await prefetchPromise; });
		expect(guardSignal!.aborted).toBe(true);
		expect(loader).not.toHaveBeenCalled();
	});
});

describe('retry delay honors the abort', () => {
	it('an abort during the retry pause resolves quietly instead of throwing the loader error', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const loader = vi.fn().mockRejectedValue(new Error('network down'));
		const promise = runLoader(matchFor({ loader, retry: { count: 1, delay: 5000 } }), loc(), controller.signal);
		await vi.advanceTimersByTimeAsync(1);
		expect(loader).toHaveBeenCalledTimes(1);
		// The navigation is superseded while the retry delay is pending.
		controller.abort();
		const value = await Promise.all([promise, vi.advanceTimersByTimeAsync(5000)]).then(([resolved]) => resolved);
		expect(value).toBeUndefined();
		const { loaderErrors, beforeLoadErrors } = await import('../../src/core/state');
		expect(loaderErrors.size).toBe(0);
		expect(beforeLoadErrors.size).toBe(0);
		expect([...cache.keys()]).toEqual([]);
		vi.useRealTimers();
	});
});
