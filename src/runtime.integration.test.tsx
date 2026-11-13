import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from './types';
import { Link, Outlet, Router, routerRuntime, useBlocker } from './index';
import { resetRouterState, setRouterConfig, submitRouteAction, useRouteData } from './runtime';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
  useParams: () => ({}),
  useSearch: () => ({}),
  useLoaderData: () => undefined,
  useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const DataText = ({ id }: { id: string }) => <p>{String(useRouteData(id).data)}</p>;
const ParamsText = ({ id }: { id: string }) => <p>{JSON.stringify(useRouteData(id).params)}</p>;

const renderAt = (
  path: string,
  tree: RouteNode,
  options: { pendingFallback?: ReactNode; errorFallback?: ComponentType<{ error: Error }> } = {},
) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} {...options} />);
};

afterEach(() => {
  cleanup();
  resetRouterState();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('nested routes, layouts and rendering', () => {
  it('renders shared layouts once and auto-renders Outlet for layout-only parents', async () => {
    const Shell = ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>;
    const tree = root([
      node('/section', '/section', { layout: Shell }, [
        node('/section/a', '/section/a', { component: () => <p>A</p> }),
        node('/section/b', '/section/b', { component: () => <p>B</p> }),
      ]),
    ]);
    renderAt('/section/a', tree);
    await screen.findByText('A');
    const shell = screen.getByTestId('shell');
    await act(async () => { await routerRuntime.navigate('/section/b'); });
    await screen.findByText('B');
    expect(screen.getByTestId('shell')).toBe(shell);
  });

  it('keeps shared layouts mounted while a child loader is pending', async () => {
    let resolveB!: (value: string) => void;
    const Shell = ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>;
    const tree = root([
      node('/section', '/section', { layout: Shell }, [
        node('/section/a', '/section/a', { component: () => <p>A</p> }),
        node('/section/b', '/section/b', {
          loader: () => new Promise<string>(resolve => { resolveB = resolve; }),
          pendingFallback: <p>Loading B</p>,
          component: () => <DataText id="/section/b" />,
        }),
      ]),
    ]);
    renderAt('/section/a', tree);
    await screen.findByText('A');
    const shell = screen.getByTestId('shell');
    let navigation!: Promise<void>;
    await act(async () => { navigation = routerRuntime.navigate('/section/b'); });
    expect(await screen.findByText('Loading B')).toBeTruthy();
    expect(screen.getByTestId('shell')).toBe(shell);
    await act(async () => { resolveB('B data'); await navigation; });
    await screen.findByText('B data');
  });

  it('renders a route error fallback and recovers after invalidate', async () => {
    let fail = true;
    let calls = 0;
    const tree = root([
      node('/broken', '/broken', {
        loader: async () => { calls++; if (fail) throw new Error('boom'); return 'recovered'; },
        errorFallback: ({ error }) => <p>Error: {error.message}</p>,
        component: () => <DataText id="/broken" />,
      }),
    ]);
    renderAt('/broken', tree);
    await screen.findByText('Error: boom');
    fail = false;
    await act(async () => { await routerRuntime.invalidate(); });
    await screen.findByText('recovered');
    expect(calls).toBe(2);
  });

  it('renders the router-wide error fallback when a route has none', async () => {
    const tree = root([
      node('/broken', '/broken', { loader: async () => { throw new Error('boom'); } }),
    ]);
    renderAt('/broken', tree, { errorFallback: ({ error }) => <p>Router error: {error.message}</p> });
    expect(await screen.findByText('Router error: boom')).toBeTruthy();
  });

  it('matches static segments before dynamic ones and dynamic ones before the catch-all', async () => {
    const tree = root([
      node('/products', '/products', { component: () => <p>List</p> }),
      node('/products/$id', '/products/:id', { component: () => <ParamsText id="/products/$id" /> }),
      node('/products/new', '/products/new', { component: () => <p>New product</p> }),
      node('/$', '/*', { component: () => <ParamsText id="/$" /> }),
    ]);
    renderAt('/products/new', tree);
    await screen.findByText('New product');
    await act(async () => { await routerRuntime.navigate('/products/42'); });
    await screen.findByText('{"id":"42"}');
    await act(async () => { await routerRuntime.navigate('/missing/deep'); });
    await screen.findByText('{"_splat":"missing/deep"}');
  });

  it('gives each matched route only its own path parameters', async () => {
    const tree = root([
      node('/team/$teamId', '/team/:teamId', { component: () => <><ParamsText id="/team/$teamId" /><Outlet /></> }, [
        node('/team/$teamId/member/$memberId', '/team/:teamId/member/:memberId', {
          component: () => <ParamsText id="/team/$teamId/member/$memberId" />,
        }),
      ]),
    ]);
    renderAt('/team/a/member/b', tree);
    await screen.findByText('{"teamId":"a"}');
    expect(screen.getByText('{"teamId":"a","memberId":"b"}')).toBeTruthy();
  });
});

describe('cache and invalidation', () => {
  it('drops inactive entries after gcTime', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const tree = root([
      node('/a', '/a', { loader: async () => ++calls, staleTime: Infinity, gcTime: 20 }),
      node('/b', '/b', { component: () => <p>B</p> }),
    ]);
    setRouterConfig(tree);
    await act(async () => { await routerRuntime.navigate('/a'); });
    await act(async () => { await routerRuntime.navigate('/b'); });
    expect(calls).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(25); });
    await act(async () => { await routerRuntime.navigate('/a'); });
    expect(calls).toBe(2);
  });

  it('invalidates cached descendants with withChildren', async () => {
    const seen: string[] = [];
    const tree = root([
      node('/posts', '/posts', {
        loader: async () => { seen.push('posts'); return 'posts'; },
        staleTime: Infinity,
      }),
      node('/posts/$postId', '/posts/:postId', {
        loader: async ({ params }) => { seen.push(`post:${params.postId}`); return params.postId; },
        staleTime: Infinity,
      }),
      node('/other', '/other', { component: () => <p>Other</p> }),
    ]);
    setRouterConfig(tree);
    await act(async () => { await routerRuntime.navigate('/posts/7'); });
    await act(async () => { await routerRuntime.navigate('/other'); });
    seen.length = 0;
    await act(async () => { await routerRuntime.invalidate('/posts', { withChildren: true }); });
    expect(seen).toContain('posts');
    expect(seen).toContain('post:7');
  });

  it('revalidates the active route in the background after a successful action', async () => {
    let calls = 0;
    const tree = root([
      node('/items', '/items', {
        loader: async () => ++calls,
        actions: () => ({ save: async (data: Record<string, unknown>) => ({ saved: data.x, version: calls }) }),
        component: () => <DataText id="/items" />,
      }),
    ]);
    renderAt('/items', tree);
    await screen.findByText('1');
    let result: unknown;
    await act(async () => { result = await submitRouteAction('save', { x: 7 }); });
    expect(result).toEqual({ saved: 7, version: 1 });
    await screen.findByText('2');
    expect(calls).toBe(2);
  });
});

describe('navigation edge cases', () => {
  it('supports render and hover Link prefetch strategies', async () => {
    let renderCalls = 0;
    let hoverCalls = 0;
    const tree = root([
      node('/', '/', {
        component: () => <><Link toRaw="/render" prefetch="render">render</Link><Link toRaw="/hover" prefetch="hover">hover</Link></>,
      }),
      node('/render', '/render', { loader: async () => { renderCalls++; return 1; }, staleTime: Infinity }),
      node('/hover', '/hover', { loader: async () => { hoverCalls++; return 1; }, staleTime: Infinity }),
    ]);
    renderAt('/', tree);
    await screen.findByText('render');
    await waitFor(() => expect(renderCalls).toBe(1));
    expect(hoverCalls).toBe(0);
    fireEvent.mouseEnter(screen.getByText('hover'));
    await waitFor(() => expect(hoverCalls).toBe(1));
  });

  it('shows cached optimistic data until the revalidation commits', async () => {
    let resolveSecond!: (value: string) => void;
    const loads = ['first'];
    const tree = root([
      node('/items', '/items', {
        optimistic: true,
        loader: () => {
          if (loads.length === 1) return Promise.resolve(loads[0]);
          return new Promise<string>(resolve => { resolveSecond = resolve; });
        },
        component: () => <DataText id="/items" />,
      }),
      node('/other', '/other', { component: () => <p>Other</p> }),
    ]);
    renderAt('/items', tree);
    await screen.findByText('first');
    await act(async () => { await routerRuntime.navigate('/other'); });
    loads.push('second');
    let navigation!: Promise<void>;
    await act(async () => { navigation = routerRuntime.navigate('/items'); });
    expect(screen.getByText('first')).toBeTruthy();
    await act(async () => { resolveSecond('second'); await navigation; });
    await screen.findByText('second');
  });

  it('polls the active route while it stays mounted', async () => {
    let calls = 0;
    const tree = root([
      node('/live', '/live', {
        pollingInterval: 25,
        loader: async () => ++calls,
        component: () => <DataText id="/live" />,
      }),
    ]);
    renderAt('/live', tree);
    await screen.findByText('1');
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
  });

  it('blocks browser back and proceeds to the requested location', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>Home</p> }),
      node('/items', '/items', { component: () => <p>Items</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/items'); });
    await screen.findByText('Items');
    const { result } = renderHook(() => useBlocker(() => true));
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.back();
      await popped;
    });
    await waitFor(() => expect(window.location.pathname).toBe('/items'));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    await act(async () => { await result.current.proceed(); });
    expect(window.location.pathname).toBe('/');
    await screen.findByText('Home');
  });

  it('restores saved scroll positions when browser history returns to a route', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 12, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 34, configurable: true });
    const tree = root([
      node('/', '/', { component: () => <p>Home</p> }),
      node('/scroll', '/scroll', { scrollRestoration: true, component: () => <p>Scroll</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/scroll'); });
    await screen.findByText('Scroll');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
    scrollTo.mockClear();
    await act(async () => { await routerRuntime.navigate('/'); });
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.back();
      await popped;
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ left: 12, top: 34 }));
  });

  it('stores search params and navigation state', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>Home</p> }),
      node('/items', '/items', { component: () => <p>{JSON.stringify(useRouteData('/items').search)}</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate({ toRaw: '/items', search: { tab: 'info' }, state: { from: 'home' } }); });
    expect(await screen.findByText('{"tab":"info"}')).toBeTruthy();
    expect(window.location.search).toBe('?tab=info');
    expect(window.history.state).toEqual({ from: 'home' });
  });
});
