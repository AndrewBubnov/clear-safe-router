import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Router, routerRuntime, Outlet } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';
import { snapshot } from '../../src/runtime/state';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const navigate = async (path: string) => { await act(async () => { await routerRuntime.navigate(path); }); };

afterEach(() => { cleanup(); resetRouterState(); vi.restoreAllMocks(); });

describe('beforeLoad guard chain', () => {
  it('runs every matched route hook in order: parent, then leaf', async () => {
    const calls: string[] = [];
    const tree = root([
      node('/admin', '/admin', { beforeLoad: () => { calls.push('admin'); } }, [
        node('/admin/$section', '/admin/:section', { beforeLoad: ({ params }) => { calls.push(`section:${params.section}`); } }, [
          node('/admin/$section/users', '/admin/:section/users', { beforeLoad: () => { calls.push('users'); } }),
        ]),
      ]),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    await navigate('/admin/finance/users');
    expect(calls).toEqual(['admin', 'section:finance', 'users']);
  });

  it('a parent guard redirect prevents child loaders and lands on the target', async () => {
    const childLoader = vi.fn();
    const tree = root([
      node('/admin', '/admin', {
        beforeLoad: ({ context, redirect }) => {
          if (!context.isAuthorized) return redirect('/login');
        },
      }, [
        node('/admin/$section/users', '/admin/:section/users', { loader: childLoader, component: () => <p>users</p> }),
      ]),
      node('/login', '/login', { component: () => <p>login</p> }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    await navigate('/admin/finance/users');
    expect(childLoader).not.toHaveBeenCalled();
    expect(snapshot().location.pathname).toBe('/login');
    expect(screen.getByText('login')).toBeTruthy();
  });

  it('a parent guard failure prevents loaders and reports the error on the parent route', async () => {
    const guardError = new Error('denied');
    const childLoader = vi.fn();
    const tree = root([
      node('/admin', '/admin', { beforeLoad: () => { throw guardError; } }, [
        node('/admin/$section/users', '/admin/:section/users', { loader: childLoader, component: () => <p>users</p> }),
      ]),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    await navigate('/admin/finance/users');
    expect(childLoader).not.toHaveBeenCalled();
    expect(snapshot().status).toBe('error');
    expect(snapshot().errors.get('/admin')).toBe(guardError);
    expect(snapshot().matches.at(-1)?.route.id).toBe('/admin/$section/users');
  });

  it('the global hook runs first with the leaf params, then the chain', async () => {
    const order: string[] = [];
    const tree = root([
      node('/admin/$section', '/admin/:section', { beforeLoad: ({ params }) => { order.push(`route:${params.section}`); } }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(
      <Router
        routes={tree}
        defaultBeforeLoad={({ params }) => { order.push(`global:${params.section}`); }}
      />,
    );
    await navigate('/admin/finance');
    await waitFor(() => expect(order.filter(entry => entry.includes('finance'))).toEqual(['global:finance', 'route:finance']));
  });
});
