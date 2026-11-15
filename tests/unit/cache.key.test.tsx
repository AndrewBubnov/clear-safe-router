import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';
import { cache } from '../../src/runtime/state';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', {}, children);

const navigate = async (path: string) => { await act(async () => { await routerRuntime.navigate(path); }); };

afterEach(() => { cleanup(); resetRouterState(); });

describe('route-scoped cache keys', () => {
  it('a parent loader runs once per param value, not once per child URL', async () => {
    const parentLoader = vi.fn(async ({ params }: any) => `cat:${params.cat}`);
    const childLoader = vi.fn(async ({ params }: any) => `item:${params.cat}/${params.id}`);
    const tree = root([
      node('/shop/$cat', '/shop/:cat', { loader: parentLoader, staleTime: Infinity, component: () => <p>category</p> }, [
        node('/shop/$cat/$id', '/shop/:cat/:id', { loader: childLoader, staleTime: Infinity, component: () => <p>item</p> }),
      ]),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);

    await navigate('/shop/a/1');
    expect(parentLoader).toHaveBeenCalledTimes(1);
    expect(parentLoader.mock.calls[0]?.[0].params).toEqual({ cat: 'a' });
    expect(childLoader).toHaveBeenCalledTimes(1);

    await navigate('/shop/a/2');
    // Same category, different item: the parent's cache entry is shared, so the
    // parent loader does not refetch.
    expect(parentLoader).toHaveBeenCalledTimes(1);
    expect(childLoader).toHaveBeenCalledTimes(2);
    expect(childLoader.mock.calls[1]?.[0].params).toEqual({ cat: 'a', id: '2' });

    await navigate('/shop/b/1');
    // A different category value is genuinely new data for the parent.
    expect(parentLoader).toHaveBeenCalledTimes(2);
    expect(parentLoader.mock.calls[1]?.[0].params).toEqual({ cat: 'b' });

    // The parent's key is its own path — one entry per param value, not per URL.
    const parentKeys = [...cache.keys()].filter(key => key.startsWith('/shop/$cat|'));
    expect(parentKeys.sort()).toEqual(['/shop/$cat|/shop/a', '/shop/$cat|/shop/b']);
  });

  it('different search values still produce separate cache entries', async () => {
    const loader = vi.fn(async ({ search }: any) => `data:${search.tab}`);
    const tree = root([
      node('/list', '/list', { loader, staleTime: Infinity, component: () => <p>list</p> }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    await navigate('/list?tab=1');
    await navigate('/list?tab=2');
    expect(loader).toHaveBeenCalledTimes(2);
    expect([...cache.keys()].filter(key => key.startsWith('/list|')).sort())
      .toEqual(['/list|/list?tab=1', '/list|/list?tab=2']);
  });
});
