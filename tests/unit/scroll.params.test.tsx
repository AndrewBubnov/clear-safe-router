import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, Outlet, Router } from '../../src/index';
import { navigate, resetRouterState, setRouterConfig } from '../../src/runtime/actions';
import { restoreScrollNow } from '../../src/runtime';
import { scrollMap, WINDOW_KEYS } from '../../src/runtime/state';
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

const setWindowScroll = (top: number) => {
  Object.defineProperty(document, 'scrollingElement', { value: { scrollTop: top, scrollLeft: 0 }, configurable: true });
};

afterEach(() => {
  cleanup();
  resetRouterState();
  scrollMap.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('scroll restoration fixes', () => {
  it('manual restoreScrollNow does nothing when nothing is saved', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });
    setWindowScroll(500);
    const tree = root([node('/fresh', '/fresh', { scrollRestoration: true, component: () => <p>fresh</p> })]);
    renderAt('/fresh', tree);
    await screen.findByText('fresh');
    scrollTo.mockClear();
    await act(async () => { await restoreScrollNow(); });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('restores on the same route with different params (/item/1 → /item/2)', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { value: scrollTo, configurable: true });
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/item/1">start</Link> }),
      node('/item/$id', '/item/:id', { scrollRestoration: true, component: () => <p>item</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('start');
    await act(async () => { await navigate('/item/1'); });
    await screen.findByText('item');
    scrollTo.mockClear();

    // Same route object, different param value — the restore effect must re-run.
    setWindowScroll(250);
    await act(async () => { await navigate('/item/2'); });
    await screen.findByText('item');
    expect(scrollTo).toHaveBeenCalled();
  });

  it('an explicit scrollRestoration: false on a child mutes the parent option', async () => {
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/list/mute">start</Link> }),
      node('/list', '/list', { scrollRestoration: true, component: () => <Outlet /> }, [
        node('/list/mute', '/list/mute', { scrollRestoration: false, component: () => <p>muted</p> }),
      ]),
      node('/elsewhere', '/elsewhere', { component: () => <p>elsewhere</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('start');
    await act(async () => { await navigate('/list/mute'); });
    await screen.findByText('muted');
    setWindowScroll(77);
    await act(async () => { await navigate('/elsewhere'); });
    await screen.findByText('elsewhere');
    // The child's explicit false wins — nothing captured for the muted URL.
    expect(scrollMap.get('/list/mute')).toBeUndefined();
  });

  it('uses a layout-level scrollRestoration option, not just the leaf', async () => {
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/list/1">start</Link> }),
      node('/list', '/list', { scrollRestoration: true, component: () => <Outlet /> }, [
        node('/list/$id', '/list/:id', { component: () => <p>item</p> }),
      ]),
      node('/elsewhere', '/elsewhere', { component: () => <p>elsewhere</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('start');
    await act(async () => { await navigate('/list/1'); });
    await screen.findByText('item');
    setWindowScroll(120);
    // Leaving the chain: the parent declares the option, so /list/1 gets captured.
    await act(async () => { await navigate('/elsewhere'); });
    await screen.findByText('elsewhere');
    const saved = scrollMap.get('/list/1');
    expect(saved?.some(([key, position]) => key === WINDOW_KEYS.top && position === 120)).toBe(true);
  });
});
