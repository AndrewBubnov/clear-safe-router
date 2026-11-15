import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Outlet, Router } from '../../src/index';
import { navigate, resetRouterState, setRouterConfig } from '../../src/runtime/actions';
import type { FileRouteOptions, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} />);
};

const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

afterEach(() => {
  cleanup();
  resetRouterState();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('polling lifecycle', () => {
  it('stops polling the old route after navigating to a route whose load errors', async () => {
    const pollingLoader = vi.fn(async () => 'tick');
    const failingLoader = vi.fn(async () => { throw new Error('boom'); });
    const tree = root([
      node('/live', '/live', { loader: pollingLoader, pollingInterval: 50, component: () => <p>tick</p> }),
      node('/broken', '/broken', { loader: failingLoader }),
    ]);
    renderAt('/live', tree);
    await screen.findByText('tick');
    await sleep(120);
    expect(pollingLoader.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Navigate to a route whose load fails: the catch path must clear the old timer.
    await act(async () => { await navigate('/broken'); });
    const callsAfterNavigation = pollingLoader.mock.calls.length;
    await sleep(200);
    expect(pollingLoader.mock.calls.length).toBe(callsAfterNavigation);
  });

  it('does not spend polling requests after navigating away', async () => {
    const pollingLoader = vi.fn(async () => 'tick');
    const otherLoader = vi.fn(async () => 'other');
    const tree = root([
      node('/live', '/live', { loader: pollingLoader, pollingInterval: 50, component: () => <p>tick</p> }),
      node('/other', '/other', { loader: otherLoader, pollingInterval: 50, component: () => <p>other</p> }),
    ]);
    renderAt('/live', tree);
    await screen.findByText('tick');
    await act(async () => { await navigate('/other'); });
    await screen.findByText('other');
    const callsAfterNavigation = pollingLoader.mock.calls.length;
    await sleep(200);
    expect(pollingLoader.mock.calls.length).toBe(callsAfterNavigation);
    expect(otherLoader.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('stops polling when <Router> unmounts', async () => {
    const pollingLoader = vi.fn(async () => 'tick');
    const tree = root([node('/live', '/live', { loader: pollingLoader, pollingInterval: 50, component: () => <p>tick</p> })]);
    const { unmount } = renderAt('/live', tree);
    await screen.findByText('tick');
    await sleep(60);
    expect(pollingLoader.mock.calls.length).toBeGreaterThanOrEqual(1);
    unmount();
    const callsAtUnmount = pollingLoader.mock.calls.length;
    await sleep(200);
    expect(pollingLoader.mock.calls.length).toBe(callsAtUnmount);
  });
});
