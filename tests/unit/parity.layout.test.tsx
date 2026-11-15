import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, Outlet, Router } from '../../src/index';
import { navigate, resetRouterState, setRouterConfig } from '../../src/runtime/actions';
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

afterEach(() => {
  cleanup();
  resetRouterState();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const makeLayout = (name: string, mounts: { count: number }) => {
  const Layout = ({ children }: { children: React.ReactNode }) => {
    useEffect(() => { mounts.count++; }, []);
    return (
      <section data-testid={`layout-${name}`}>
        <span>{name}</span>
        {children}
      </section>
    );
  };
  return Layout;
};

describe('layout parity (original Router.test.tsx)', () => {
  it('wraps the matched element in its layout', async () => {
    const mounts = { count: 0 };
    const tree = root([
      node('/app', '/app', { layout: makeLayout('shell', mounts) }, [
        node('/app/page', '/app/page', { component: () => <p>App page</p> }),
      ]),
    ]);

    renderAt('/app/page', tree);

    const shell = await screen.findByTestId('layout-shell');
    expect(shell.textContent).toContain('App page');
    expect(shell.textContent).toContain('shell');
  });

  it('stacks parent and child layouts around the page', async () => {
    const tree = root([
      node('/app', '/app', { layout: makeLayout('outer', { count: 0 }) }, [
        node('/app/deep', '/app/deep', { layout: makeLayout('inner', { count: 0 }) }, [
          node('/app/deep/page', '/app/deep/page', { component: () => <p>Deep page</p> }),
        ]),
      ]),
    ]);

    renderAt('/app/deep/page', tree);

    const outer = await screen.findByTestId('layout-outer');
    const inner = screen.getByTestId('layout-inner');
    expect(outer.contains(inner)).toBe(true);
    expect(inner.textContent).toContain('Deep page');
    expect(inner.textContent).toContain('inner');
  });

  it('keeps a layout mounted when navigating between its children', async () => {
    const mounts = { count: 0 };
    const tree = root([
      node('/app', '/app', { layout: makeLayout('shell', mounts) }, [
        node('/app/a', '/app/a', { component: () => <p>Page A</p> }),
        node('/app/b', '/app/b', { component: () => <p>Page B</p> }),
      ]),
    ]);

    renderAt('/app/a', tree);
    await screen.findByText('Page A');
    expect(mounts.count).toBe(1);

    await act(async () => { await navigate('/app/b'); });
    await screen.findByText('Page B');

    expect(mounts.count).toBe(1);
    expect(screen.getByTestId('layout-shell').textContent).toContain('Page B');
  });

  it('keeps a layout mounted across loader navigation', async () => {
    const mounts = { count: 0 };
    const tree = root([
      node('/app', '/app', { layout: makeLayout('shell', mounts) }, [
        node('/app/a', '/app/a', { component: () => <p>Page A</p>, loader: async () => 'a' }),
        node('/app/b', '/app/b', { component: () => <p>Page B</p>, loader: async () => 'b' }),
      ]),
    ]);

    renderAt('/app/a', tree);
    await screen.findByText('Page A');
    expect(mounts.count).toBe(1);

    await act(async () => { await navigate('/app/b'); });
    await screen.findByText('Page B');

    expect(mounts.count).toBe(1);
  });

  it('renders a layout-only parent through Outlet on child navigation', async () => {
    const mounts = { count: 0 };
    const Shell = makeLayout('shell', mounts);
    const tree = node('__root__', '/', {
      component: () => <Outlet />,
      layout: ({ children }: { children: React.ReactNode }) => (
        <Shell><Link toRaw="/app/page">Go to page</Link>{children}</Shell>
      ),
    }, [
      node('/', '/', { component: () => <p>Home</p> }),
      node('/app', '/app', {}, [
        node('/app/page', '/app/page', { component: () => <p>Nested page</p> }),
      ]),
    ]);

    renderAt('/', tree);
    await act(async () => { screen.getByText('Go to page').click(); });

    expect(await screen.findByText('Nested page')).toBeTruthy();
    expect(screen.getByTestId('layout-shell').textContent).toContain('Nested page');
  });
});
