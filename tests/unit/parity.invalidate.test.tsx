import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Outlet, Router, routerRuntime, useCacheSnapshot, useRouteStatus } from '../../src/index';
import { resetRouterState, setRouterConfig, useRouteData } from '../../src/runtime';

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
const home = () => node('/', '/', { component: () => <p>Home</p> });

const SnapshotProbe = () => {
  const entries = useCacheSnapshot();
  return <div data-testid="snapshot">{JSON.stringify(entries)}</div>;
};

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(
    <>
      <SnapshotProbe />
      <Router routes={tree} enableCacheSnapshot />
    </>
  );
};

const entries = () => JSON.parse(screen.getByTestId('snapshot').textContent ?? '[]') as Array<Record<string, unknown>>;
const cachedAt = (path: string) => entries().find(entry => entry.path === path);

type InvalidateResult = Awaited<ReturnType<typeof routerRuntime.invalidate>>;
const runInvalidate = async (target?: Parameters<typeof routerRuntime.invalidate>[0], options?: Parameters<typeof routerRuntime.invalidate>[1]) => {
  let result!: InvalidateResult;
  await act(async () => { result = await routerRuntime.invalidate(target, options); });
  return result;
};

afterEach(() => { cleanup(); resetRouterState(); vi.restoreAllMocks(); });

describe('invalidate parity (original invalidate.test.ts)', () => {
  it('invalidates a cached path and re-fetches it', async () => {
    const loader = vi.fn().mockResolvedValueOnce('old data').mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users</p> }),
    ]);
    renderAt('/users', tree);
    await screen.findByText('Users');
    const result = await runInvalidate('/users');
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('fresh data');
    expect(cachedAt('/users')?.data).toBe('fresh data');
  });

  it('does not delete the cache entry when staleOnly is set', async () => {
    const loader = vi.fn().mockResolvedValueOnce('old data').mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users:{String(useRouteData('/users').data)}</p> }),
    ]);
    renderAt('/users', tree);
    await screen.findByText('Users:old data');
    const result = await runInvalidate('/users', { staleOnly: true });
    expect(result).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Users:old data')).toBeTruthy();
  });

  it('waits for an in-flight load and refetches instead of returning it', async () => {
    let resolvePrefetch!: (value: string) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolvePrefetch = resolve; }))
      .mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    let prefetch!: Promise<void>;
    act(() => { prefetch = routerRuntime.prefetch('/users'); });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    let invalidation!: Promise<InvalidateResult>;
    act(() => { invalidation = routerRuntime.invalidate('/users'); });
    await act(async () => { resolvePrefetch('stale prefetch'); await prefetch; });
    const result = await act(async () => invalidation);
    expect(result[0]?.data).toBe('fresh data');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('force adds a path that is not cached', async () => {
    const loader = vi.fn().mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    const result = await runInvalidate('/users', { force: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('fresh data');
  });

  it('returns an empty array for an unknown path', async () => {
    const tree = root([home()]);
    renderAt('/', tree);
    await screen.findByText('Home');
    expect(await runInvalidate('/nonexistent')).toEqual([]);
  });

  it('invalidates multiple paths', async () => {
    const usersLoader = vi.fn().mockResolvedValue('users');
    const postsLoader = vi.fn().mockResolvedValue('posts');
    const tree = root([
      home(),
      node('/users', '/users', { loader: usersLoader, staleTime: Infinity, component: () => <p>Users</p> }),
      node('/posts', '/posts', { loader: postsLoader, staleTime: Infinity, component: () => <p>Posts</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users'); });
    await act(async () => { await routerRuntime.navigate('/posts'); });
    const result = await runInvalidate(['/users', '/posts']);
    expect(result.map(entry => entry.path).sort()).toEqual(['/posts', '/users']);
  });

  it('invalidates the current route when no path is given', async () => {
    const loader = vi.fn().mockResolvedValueOnce('old').mockResolvedValue('fresh');
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users</p> }),
    ]);
    renderAt('/users', tree);
    await screen.findByText('Users');
    const result = await runInvalidate();
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('/users');
  });

  it('updates rendered data when invalidating the current route', async () => {
    const loader = vi.fn().mockResolvedValueOnce('old data').mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users:{String(useRouteData('/users').data)}</p> }),
    ]);
    renderAt('/users', tree);
    await screen.findByText('Users:old data');
    await runInvalidate('/users');
    expect(await screen.findByText('Users:fresh data')).toBeTruthy();
  });

  it('handles a path with search params', async () => {
    const loader = vi.fn(async ({ search }: any) => `page:${search.page}`);
    const tree = root([
      home(),
      node('/users', '/users', { loader, staleTime: Infinity, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users?page=1'); });
    const result = await runInvalidate('/users?page=1');
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('/users?page=1');
  });

  it('does not apply a revalidated search variant to a different active search', async () => {
    const loader = vi.fn(async ({ search }: any) => `page:${search.page}`);
    const tree = root([
      home(),
      node('/users', '/users', {
        loader,
        staleTime: Infinity,
        component: () => <p>Users:{String(useRouteData('/users').data)}|{useRouteStatus()}</p>,
      }),
    ]);
    renderAt('/users?page=1', tree);
    await screen.findByText('Users:page:1|active');
    await act(async () => { await routerRuntime.navigate('/users?page=2'); });
    await screen.findByText('Users:page:2|active');
    const result = await runInvalidate('/users?page=1');
    expect(result[0]?.data).toBe('page:1');
    expect(screen.getByText('Users:page:2|active')).toBeTruthy();
  });

  it('fetches an uncached path by default (implicit force)', async () => {
    const loader = vi.fn().mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    const result = await runInvalidate('/users');
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('fresh data');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not fetch an uncached path with explicit force: false', async () => {
    const loader = vi.fn().mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    expect(await runInvalidate('/users', { force: false })).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not fetch an uncached path with staleOnly', async () => {
    const loader = vi.fn().mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', { loader, component: () => <p>Users</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    expect(await runInvalidate('/users', { staleOnly: true })).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('sets the route to error when revalidation of the working page fails', async () => {
    const loadError = new Error('refetch failed');
    const loader = vi.fn().mockResolvedValueOnce('old data').mockRejectedValueOnce(loadError).mockResolvedValue('fresh data');
    const tree = root([
      home(),
      node('/users', '/users', {
        loader,
        staleTime: Infinity,
        errorFallback: ({ error }: { error: Error }) => <p>Failed: {error.message}</p>,
        component: () => <p>Users:{String(useRouteData('/users').data)}</p>,
      }),
    ]);
    renderAt('/users', tree);
    await screen.findByText('Users:old data');
    const result = await runInvalidate('/users');
    expect(result[0]?.error).toBe(loadError);
    expect(await screen.findByText('Failed: refetch failed')).toBeTruthy();
  });

  it('does not touch the current page when revalidating another route', async () => {
    const usersLoader = vi.fn().mockResolvedValue('users data');
    const postsLoader = vi.fn().mockResolvedValueOnce('old posts').mockResolvedValue('fresh posts');
    const tree = root([
      home(),
      node('/users', '/users', { loader: usersLoader, staleTime: Infinity, component: () => <p>Users:{String(useRouteData('/users').data)}</p> }),
      node('/posts', '/posts', {
        loader: postsLoader,
        staleTime: Infinity,
        errorFallback: () => <p>Posts failed</p>,
        component: () => <p>Posts</p>,
      }),
    ]);
    renderAt('/posts', tree);
    await screen.findByText('Posts');
    await act(async () => { await routerRuntime.navigate('/users'); });
    await screen.findByText('Users:users data');
    const result = await runInvalidate('/posts');
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('fresh posts');
    expect(screen.getByText('Users:users data')).toBeTruthy();
    expect(screen.queryByText('Posts failed')).toBeNull();
  });

  it('invalidates only the exact cached dynamic path', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    for (const path of ['/users/1', '/users/2', '/users/3']) await act(async () => { await routerRuntime.navigate(path); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ path: '/users/1', data: 'user:1@/users/1' });
    expect(dynamicLoader).toHaveBeenCalledTimes(1);
    expect(dynamicLoader.mock.calls[0]?.[0]).toMatchObject({ params: { id: '1' }, location: { pathname: '/users/1' } });
    expect(cachedAt('/users/2')?.data).toBe('user:2@/users/2');
    expect(cachedAt('/users/3')?.data).toBe('user:3@/users/3');
  });

  it('treats a trailing slash as the same pathname but still not a sibling', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users/1/'); });
    await act(async () => { await routerRuntime.navigate('/users/2'); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/1');
    expect(result.map(entry => entry.path).sort()).toEqual(['/users/1', '/users/1/']);
    expect(dynamicLoader).toHaveBeenCalledTimes(2);
    const requestedPaths = dynamicLoader.mock.calls.map(([args]) => args.location.pathname).sort();
    expect(requestedPaths).toEqual(['/users/1', '/users/1/']);
    expect(cachedAt('/users/2')?.data).toBe('user:2@/users/2');
  });

  it('force revalidates an uncached dynamic path without touching its siblings', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users/2'); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/4', { force: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ path: '/users/4', data: 'user:4@/users/4' });
    expect(dynamicLoader).toHaveBeenCalledTimes(1);
    expect(dynamicLoader.mock.calls[0]?.[0]).toMatchObject({ params: { id: '4' } });
    expect(cachedAt('/users/2')?.data).toBe('user:2@/users/2');
  });

  it('invalidates all search variants of one dynamic path only', async () => {
    const dynamicLoader = vi.fn(async ({ params, location, search }: any) => `user:${params.id}@${location.pathname}${search.tab ? `?tab=${search.tab}` : ''}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    for (const path of ['/users/1?tab=a', '/users/1?tab=b', '/users/2']) await act(async () => { await routerRuntime.navigate(path); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/1?tab=a');
    expect(result.map(entry => entry.path).sort()).toEqual(['/users/1?tab=a', '/users/1?tab=b']);
    expect(dynamicLoader).toHaveBeenCalledTimes(2);
    const calls = dynamicLoader.mock.calls.map(([args]) => args);
    expect(calls.map(args => args.params.id)).toEqual(['1', '1']);
    expect(calls.map(args => args.location.pathname)).toEqual(['/users/1', '/users/1']);
    expect(calls.map(args => args.search.tab).sort()).toEqual(['a', 'b']);
    expect(cachedAt('/users/2')?.data).toBe('user:2@/users/2');
  });

  it('invalidates a pattern target through cached paths without fetching the pattern', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users/1'); });
    await act(async () => { await routerRuntime.navigate('/users/2'); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/:id');
    expect(result.map(entry => entry.path).sort()).toEqual(['/users/1', '/users/2']);
    expect(dynamicLoader).toHaveBeenCalledTimes(2);
    const requestedPaths = dynamicLoader.mock.calls.map(([args]) => args.location.pathname).sort();
    expect(requestedPaths).toEqual(['/users/1', '/users/2']);
    expect(requestedPaths.some(path => path.includes(':') || path.includes('['))).toBe(false);
  });

  it('matches bracket patterns against cached concrete paths only', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/users/1'); });
    await act(async () => { await routerRuntime.navigate('/users/2'); });
    dynamicLoader.mockClear();
    const result = await runInvalidate('/users/[id]', { force: true });
    expect(result.map(entry => entry.path).sort()).toEqual(['/users/1', '/users/2']);
    expect(dynamicLoader).toHaveBeenCalledTimes(2);
    const requestedPaths = dynamicLoader.mock.calls.map(([args]) => args.location.pathname);
    expect(requestedPaths).not.toContain('/users/[id]');
    expect(requestedPaths).not.toContain('/users/:id');
  });

  it('does not fetch an uncached pattern, even with force', async () => {
    const dynamicLoader = vi.fn(async ({ params, location }: any) => `user:${params.id}@${location.pathname}`);
    const tree = root([
      home(),
      node('/users/$id', '/users/:id', { loader: dynamicLoader, staleTime: Infinity, component: () => <p>User</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    dynamicLoader.mockClear();
    for (const pattern of ['/users/:id', '/users/[id]']) {
      expect(await runInvalidate(pattern, { force: true })).toEqual([]);
    }
    expect(dynamicLoader).not.toHaveBeenCalled();
  });

  it('withChildren revalidates nested entries without fetching literal param paths', async () => {
    const nestLoader = vi.fn(async ({ params }: any) => `nest:${params.nestId}`);
    const itemLoader = vi.fn(async ({ params }: any) => `item:${params.nestId}/${params.itemId}`);
    const tree = root([
      home(),
      node('/nest', '/nest', { component: () => <p>Nest</p> }, [
        node('/nest/$nestId', '/nest/:nestId', { loader: nestLoader, staleTime: Infinity, component: () => <p>Nest</p> }, [
          node('/nest/$nestId/item', '/nest/:nestId/item', { component: () => <Outlet /> }, [
            node('/nest/$nestId/item/$itemId', '/nest/:nestId/item/:itemId', { loader: itemLoader, staleTime: Infinity, component: () => <p>Item</p> }),
          ]),
        ]),
      ]),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/nest/abc'); });
    await act(async () => { await routerRuntime.navigate('/nest/abc/item/def'); });
    nestLoader.mockClear();
    itemLoader.mockClear();
    const result = await runInvalidate('/nest', { withChildren: true });
    expect(nestLoader).toHaveBeenCalledTimes(1);
    expect(itemLoader).toHaveBeenCalledTimes(1);
    expect(nestLoader.mock.calls[0]?.[0]).toMatchObject({ params: { nestId: 'abc' } });
    expect(itemLoader.mock.calls[0]?.[0]).toMatchObject({ params: { nestId: 'abc', itemId: 'def' } });
    expect(result.every(entry => !entry.path.includes(':') && !entry.path.includes('['))).toBe(true);
    expect(result.map(entry => entry.path).sort()).toEqual(['/nest', '/nest/abc', '/nest/abc/item/def']);
  });

  it('withChildren still recurses when the parent route has no loader', async () => {
    const childLoader = vi.fn(async ({ params }: any) => `child:${params.nestId}`);
    const tree = root([
      home(),
      node('/nest', '/nest', { component: () => <p>Nest</p> }, [
        node('/nest/$nestId', '/nest/:nestId', { loader: childLoader, staleTime: Infinity, component: () => <p>Nest</p> }),
      ]),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await routerRuntime.navigate('/nest/abc'); });
    childLoader.mockClear();
    const result = await runInvalidate('/nest', { withChildren: true });
    expect(childLoader).toHaveBeenCalledTimes(1);
    expect(childLoader.mock.calls[0]?.[0]).toMatchObject({ params: { nestId: 'abc' } });
    expect(result.map(entry => entry.path).sort()).toEqual(['/nest', '/nest/abc']);
  });
});

