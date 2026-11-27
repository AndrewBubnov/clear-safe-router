import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Outlet, Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';
import { routerConfig } from '../../src/core/config';

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

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} />);
};

/** One macrotask: the coalescing registry releases its run after the current
 * turn ends, so this clears the way for a genuinely fresh refetch. */
const nextTurn = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

afterEach(() => { cleanup(); resetRouterState(); routerConfig.warnOnUnmatchedRoutes = false; vi.restoreAllMocks(); });

describe('invalidate coalescing', () => {
  it('reports a cache-only miss in dev instead of silently doing nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = vi.fn().mockResolvedValue('data');
    const tree = root([
      node('/tasks', '/tasks', { loader, component: () => <p>Tasks</p> }),
    ]);
    renderAt('/tasks', tree);
    await screen.findByText('Tasks');
    routerConfig.warnOnUnmatchedRoutes = true;

    await act(async () => { await routerRuntime.invalidate('/nope', { force: false }); });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('/nope');
    expect(warn.mock.calls[0]?.[0]).toContain('cache-only');

    routerConfig.warnOnUnmatchedRoutes = false;
    await act(async () => { await routerRuntime.invalidate('/nope', { force: false }); });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('chained awaited invalidates of one route share a single loader run', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    const tree = root([
      node('/tasks', '/tasks', { loader, component: () => <p>Tasks</p> }),
    ]);
    renderAt('/tasks', tree);
    await screen.findByText('Tasks');
    expect(loader).toHaveBeenCalledTimes(1);

    const results = await act(async () => [
      await routerRuntime.invalidate('/tasks'),
      await routerRuntime.invalidate('/tasks'),
      await routerRuntime.invalidate('/tasks'),
    ]);
    expect(loader).toHaveBeenCalledTimes(2);
    for (const result of results as Array<Array<{ data: unknown }>>)
      expect(result).toHaveLength(1);
  });

  it('an invalidate in a later turn refetches again', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    const tree = root([
      node('/tasks', '/tasks', { loader, component: () => <p>Tasks</p> }),
    ]);
    renderAt('/tasks', tree);
    await screen.findByText('Tasks');
    await act(async () => { await routerRuntime.invalidate('/tasks'); });
    await nextTurn();
    await act(async () => { await routerRuntime.invalidate('/tasks'); });
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('enumerating parent and child re-runs the parent loader once', async () => {
    const sectionLoader = vi.fn().mockResolvedValue('section');
    const itemsLoader = vi.fn().mockResolvedValue('items');
    const tree = root([
      node('section', '/section', {
        loader: sectionLoader,
        component: () => <Outlet />,
      }, [
        node('items', '/section/items', { loader: itemsLoader, component: () => <p>Items</p> }),
      ]),
    ]);
    renderAt('/section/items', tree);
    await screen.findByText('Items');
    expect(sectionLoader).toHaveBeenCalledTimes(1);
    expect(itemsLoader).toHaveBeenCalledTimes(1);

    await act(async () => { await routerRuntime.invalidate('/section'); });
    await act(async () => { await routerRuntime.invalidate('/section/items'); });
    expect(sectionLoader).toHaveBeenCalledTimes(2);
    expect(itemsLoader).toHaveBeenCalledTimes(2);
  });

  it('concurrent un-awaited invalidates ride one run', async () => {
    let resolveLoader!: (value: string) => void;
    // The initial navigation load resolves immediately; the invalidate-triggered
    // run hangs until the test releases it.
    const loader = vi.fn()
      .mockResolvedValueOnce('initial')
      .mockImplementation(() => new Promise<string>((resolve) => { resolveLoader = resolve; }));
    const tree = root([
      node('/tasks', '/tasks', { loader, component: () => <p>Tasks</p> }),
    ]);
    renderAt('/tasks', tree);
    await screen.findByText('Tasks');
    expect(loader).toHaveBeenCalledTimes(1);

    let results!: Array<Array<{ data: unknown }>>;
    await act(async () => {
      const first = routerRuntime.invalidate('/tasks');
      const second = routerRuntime.invalidate('/tasks');
      resolveLoader('fresh');
      results = (await Promise.all([first, second])) as Array<Array<{ data: unknown }>>;
    });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(results[0]?.[0]?.data).toBe('fresh');
    expect(results[1]?.[0]?.data).toBe('fresh');
  });
});
