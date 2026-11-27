import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Outlet, Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;

afterEach(() => { cleanup(); resetRouterState(); });

describe('invalidate chain dedup', () => {
  it('naming a parent and its child re-runs each loader once', async () => {
    const projectsLoader = vi.fn().mockResolvedValue('projects');
    const projectLoader = vi.fn().mockResolvedValue('project');
    const tree = node('__root__', '/', { component: () => <Outlet /> }, [
      node('projects', '/projects', { loader: projectsLoader, staleTime: Infinity, component: () => <Outlet /> }, [
        node('index', '/projects/', { component: () => <p>List</p> }),
        node('/projects/$projectId', '/projects/:projectId', { loader: projectLoader, staleTime: Infinity, component: () => <p>Detail</p> }),
      ]),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/projects');
    render(<Router routes={tree} />);
    await screen.findByText('List');
    expect(projectsLoader).toHaveBeenCalledTimes(1);
    await act(async () => {
      await routerRuntime.navigate('/projects/p-1');
    });
    await screen.findByText('Detail');
    // Navigating deeper does not refetch a fresh parent layout.
    expect(projectsLoader).toHaveBeenCalledTimes(1);
    expect(projectLoader).toHaveBeenCalledTimes(1);

    // One array call naming both the section and the item: the section loader
    // is shared by both targets' chains, so it runs once, not per target.
    await act(async () => {
      await routerRuntime.invalidate(['/projects', '/projects/p-1'], { withChildren: true });
    });
    expect(projectsLoader).toHaveBeenCalledTimes(2);
    expect(projectLoader).toHaveBeenCalledTimes(2);
  });
});
