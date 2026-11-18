import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, Outlet, Router } from '../../src/index';
import { navigate, resetRouterState, setRouterConfig } from '../../src/core/actions';
import { restoreScrollNow } from '../../src/runtime';
import type { FileRouteOptions, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} />);
};

const setWindowScroll = (top: number, left = 0) => {
  Object.defineProperty(document, 'scrollingElement', { value: { scrollTop: top, scrollLeft: left }, configurable: true });
};

afterEach(() => {
  cleanup();
  resetRouterState();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('useRestoreScroll parity: window scroll (original useRestoreScroll.test.tsx)', () => {
  it('saves window scroll on leave and restores it on manual call', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });
    setWindowScroll(150);
    const tree = root([
      node('/', '/', { scrollRestoration: true, component: () => <Link toRaw="/other">To other</Link> }),
      node('/other', '/other', { component: () => <p>Other page</p> }),
    ]);

    renderAt('/', tree);
    await screen.findByText('To other');
    await act(async () => { screen.getByText('To other').click(); });
    await screen.findByText('Other page');

    await act(async () => { await navigate('/'); });
    await screen.findByText('To other');
    scrollTo.mockClear();

    await act(async () => { restoreScrollNow(); });

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 150 }));
  });

  it('reads the scroll map fresh on every restore call', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });
    setWindowScroll(300);
    const tree = root([
      node('/', '/', { scrollRestoration: true, component: () => <p>Home</p> }),
      node('/other', '/other', { component: () => <p>Other page</p> }),
    ]);

    renderAt('/', tree);
    await screen.findByText('Home');
    await act(async () => { await navigate('/other'); });
    await screen.findByText('Other page');
    await act(async () => { await navigate('/'); });
    await screen.findByText('Home');

    scrollTo.mockClear();
    await act(async () => { restoreScrollNow(); });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 300 }));

    scrollTo.mockClear();
    setWindowScroll(420);
    await act(async () => { await navigate('/other'); });
    await screen.findByText('Other page');
    await act(async () => { await navigate('/'); });
    await screen.findByText('Home');
    scrollTo.mockClear();

    await act(async () => { restoreScrollNow(); });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 420 }));
  });
});
