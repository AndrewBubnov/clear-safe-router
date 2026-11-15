import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteNode } from '../../src/types';
import { Router, Link, Outlet, createFileRoute, routerRuntime } from '../../src/index';
import { resetRouterState } from '../../src/runtime';

const HomeRoute = createFileRoute('/')({ component: () => <><h1>Home</h1><Link to="/playground/cache/product/$productId" params={{ productId: '7' }}>Product</Link></> });
const MemberRoute = createFileRoute('/playground/cache/product/$productId')({
  loader: async ({ params }) => ({ id: params.productId }),
  staleTime: 30_000,
  component: () => <><h1>Product {MemberRoute.useLoaderData<{ id: string }>().id}</h1><Link to="/">Home</Link></>,
});
const RootRoute = createFileRoute('__root__')({ component: () => <Outlet /> });
const makeTree = (member: Record<string, unknown> = MemberRoute as unknown as Record<string, unknown>) => ({ ...RootRoute, path: '/', children: [
  { ...HomeRoute, path: '/', children: [] },
  { ...member, path: '/playground/cache/product/:productId', children: [] },
] }) as unknown as RouteNode;
const renderRouter = (path = '/', tree = makeTree()) => {
  window.history.replaceState(null, '', path);
  return render(<Router routes={tree} notFound={<h1>Missing</h1>} />);
};

afterEach(() => { cleanup(); resetRouterState(); vi.restoreAllMocks(); });

describe('router runtime', () => {
  it('initially matches, loads and renders a nested dynamic route', async () => {
    renderRouter('/playground/cache/product/7');
    expect(await screen.findByText('Product 7')).toBeTruthy();
  });

  it('navigates and writes the browser URL; back/forward uses popstate navigation', async () => {
    renderRouter('/');
    await screen.findByText('Home');
    await act(async () => { screen.getByText("Product").click(); });
    expect(await screen.findByText('Product 7')).toBeTruthy();
    expect(window.location.pathname).toBe('/playground/cache/product/7');
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.back();
      await popped;
    });
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('renders the configured unknown route UI', async () => {
    renderRouter('/unknown/path');
    expect(await screen.findByText('Missing')).toBeTruthy();
  });

  it('does not let an obsolete loader overwrite current navigation state', async () => {
    let resolveOld!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>(resolve => { resolveOld = resolve; }));
    const pendingRoute = createFileRoute('/playground/cache/product/$productId')({ loader, component: () => <p>old</p> });
    renderRouter('/', makeTree(pendingRoute));
    await screen.findByText('Home');
    const first = routerRuntime.navigate({ toRaw: '/playground/cache/product/7' });
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    const second = routerRuntime.navigate({ toRaw: '/' });
    await second;
    resolveOld('stale');
    await first;
    expect(screen.getByText('Home')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('reruns a cancelled loader when revisiting its URL', async () => {
    let resolveFirst!: (value: string) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce('fresh');
    const page = createFileRoute('/playground/cache/product/$productId')({ loader, component: () => <p>{String(page.useLoaderData<unknown>())}</p> });
    renderRouter('/', makeTree(page));
    await screen.findByText('Home');
    const first = routerRuntime.navigate({ toRaw: '/playground/cache/product/7' });
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await routerRuntime.navigate({ toRaw: '/' });
    await routerRuntime.navigate({ toRaw: '/playground/cache/product/7' });
    resolveFirst('stale');
    await first;
    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.getByText('fresh')).toBeTruthy();
  });
});
