import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Outlet, Router, routerRuntime, useBlocker } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime/actions';
import { blockerStateStore, blockedTargetStore } from '../../src/runtime/state';
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

afterEach(() => {
  cleanup();
  resetRouterState();
  window.history.replaceState(null, '', '/');
});

describe('useBlocker lifecycle', () => {
  it('releases the global charged state when the hook unmounts', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/away', '/away', { component: () => <p>away</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('home');
    const { unmount } = renderHook(() => useBlocker(() => true));
    expect(blockerStateStore.getState()).toBe('charged');
    unmount();
    expect(blockerStateStore.getState()).toBe('unblocked');
    // Navigation must not be stuck after the unmount.
    await act(async () => { await routerRuntime.navigate('/away'); });
    expect(window.location.pathname).toBe('/away');
  });

  it('releases blocked state and pending target when the hook unmounts mid-block', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/away', '/away', { component: () => <p>away</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('home');
    const { unmount } = renderHook(() => useBlocker(() => true));
    await waitFor(() => expect(blockerStateStore.getState()).toBe('charged'));
    // A navigation attempt turns charged into blocked with a pending target.
    await act(async () => { await routerRuntime.navigate('/away'); });
    expect(blockerStateStore.getState()).toBe('blocked');
    expect(blockedTargetStore.getState()).not.toBeNull();
    unmount();
    expect(blockerStateStore.getState()).toBe('unblocked');
    expect(blockedTargetStore.getState()).toBeNull();
    // Navigation is not stuck after the unmount.
    await act(async () => { await routerRuntime.navigate('/away'); });
    expect(window.location.pathname).toBe('/away');
  });

  it('re-evaluates the decision when closure state changes between commits', async () => {
    let dirty = false;
    const tree = root([node('/', '/', { component: () => <p>home</p> })]);
    renderAt('/', tree);
    await screen.findByText('home');
    const { rerender } = renderHook(() => useBlocker(() => dirty));
    await waitFor(() => expect(blockerStateStore.getState()).toBe('unblocked'));
    dirty = true;
    rerender();
    await waitFor(() => expect(blockerStateStore.getState()).toBe('charged'));
  });
});
