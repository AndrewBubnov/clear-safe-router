import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Outlet, Router } from '../../src/index';
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

/** One macrotask: the hidden-children check verifies after the snapshot settles. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { cleanup(); resetRouterState(); routerConfig.warnOnHiddenChildren = false; vi.restoreAllMocks(); });

describe('hidden children dev warning', () => {
  it('warns when a parent component renders without <Outlet />', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    routerConfig.warnOnHiddenChildren = true;
    const tree = root([
      node('section', '/section', {
        component: () => <p>Section (no outlet here)</p>,
      }, [
        node('items', '/section/items', { component: () => <p>Items</p> }),
      ]),
    ]);
    renderAt('/section/items', tree);
    await screen.findByText('Section (no outlet here)');
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"section"');
    expect(warn.mock.calls[0]?.[0]).toContain('"items"');
    expect(warn.mock.calls[0]?.[0]).toContain('/section/items');
    expect(screen.getByText('Section (no outlet here)')).toBeTruthy();
    expect(screen.queryByText('Items')).toBeNull();
  });

  it('stays quiet when the chain renders <Outlet /> all the way down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    routerConfig.warnOnHiddenChildren = true;
    const tree = root([
      node('section', '/section', {
        component: () => <div><p>Section</p><Outlet /></div>,
      }, [
        node('items', '/section/items', { component: () => <p>Items</p> }),
      ]),
    ]);
    renderAt('/section/items', tree);
    await screen.findByText('Items');
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when the flag is off (default)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = root([
      node('section', '/section', {
        component: () => <p>Section (no outlet here)</p>,
      }, [
        node('items', '/section/items', { component: () => <p>Items</p> }),
      ]),
    ]);
    renderAt('/section/items', tree);
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });
});
