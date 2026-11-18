import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Outlet, Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/core/actions';
import { cache, contextStore } from '../../src/core/state';
import type { FileRouteOptions, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

afterEach(() => {
  cleanup();
  resetRouterState();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('prefetch respects beforeLoad guards', () => {
  it('does not run loaders when a guard redirects', async () => {
    const protectedLoader = vi.fn(async () => 'secret');
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/protected', '/protected', {
        beforeLoad: ({ redirect }) => redirect('/login'),
        loader: protectedLoader,
      }),
      node('/login', '/login', { component: () => <p>login</p> }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(<Router routes={tree} />);
    await screen.findByText('home');

    await act(async () => { await routerRuntime.prefetch('/protected'); });
    expect(protectedLoader).not.toHaveBeenCalled();
    expect([...cache.keys()].some(key => key.includes('/protected'))).toBe(false);
  });

  it('still prefetches when guards pass', async () => {
    const loader = vi.fn(async () => 'data');
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/open', '/open', { beforeLoad: () => undefined, loader, staleTime: Infinity }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(<Router routes={tree} />);
    await screen.findByText('home');

    await act(async () => { await routerRuntime.prefetch('/open'); });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.get('/open|/open')?.value).toBe('data');
  });

  it('passes guard setContext to prefetch loaders via a local context, without touching the global store', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/tokened', '/tokened', {
        beforeLoad: ({ setContext }) => { setContext({ token: 'fresh' }); },
        loader: ({ context }) => `value:${(context as { token?: string }).token ?? 'none'}`,
        staleTime: Infinity,
      }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(<Router routes={tree} />);
    await screen.findByText('home');

    await act(async () => { await routerRuntime.prefetch('/tokened'); });
    // The loader saw the guard's local context...
    expect(cache.get('/tokened|/tokened')?.value).toBe('value:fresh');
    // ...while the global context store was never written.
    expect(contextStore.getState()).not.toHaveProperty('token');
  });
});
