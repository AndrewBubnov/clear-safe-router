import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Router, routerRuntime, Outlet, useLocation } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';
import { snapshot } from '../../src/runtime/state';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const navigate = async (path: string) => { await act(async () => { await routerRuntime.navigate(path); }); };

afterEach(() => { cleanup(); resetRouterState(); });

describe('location.prevLocation', () => {
  it('is absent before the first navigation completes', async () => {
    const tree = root([node('/a', '/a', { component: () => <p>a</p> })]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/a');
    render(<Router routes={tree} />);
    await navigate('/a');
    expect(snapshot().location.prevLocation).toBeUndefined();
  });

  it('carries the pathname and search of the location navigated away from', async () => {
    const tree = root([
      node('/a', '/a', { component: () => <p>a</p> }),
      node('/b', '/b', { component: () => <p>b</p> }),
      node('/c', '/c', { component: () => <p>c</p> }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/a');
    render(<Router routes={tree} />);
    await navigate('/a');
    await navigate('/b?x=1');
    expect(snapshot().location.prevLocation).toEqual({ pathname: '/a', search: '' });
    await navigate('/c');
    expect(snapshot().location.prevLocation).toEqual({ pathname: '/b', search: '?x=1' });
  });

  it('after a guard redirect, prevLocation is the URL the user tried to reach', async () => {
    const tree = root([
      node('/protected', '/protected', {
        beforeLoad: ({ context, redirect }) => { if (!context.isAuthorized) return redirect('/login'); },
      }),
      node('/login', '/login', { component: () => <p>login</p> }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    await navigate('/protected');
    expect(snapshot().location.pathname).toBe('/login');
    // The user asked for /protected — that is what a "back to the page you wanted" link points to.
    expect(snapshot().location.prevLocation).toEqual({ pathname: '/protected', search: '' });
  });

  it('is exposed to components via useLocation', async () => {
    let seen: unknown;
    const Probe = () => { seen = useLocation().prevLocation; return null; };
    const tree = root([
      node('/a', '/a', { component: () => <p>a</p> }),
      node('/b', '/b', { component: () => <><Probe /><p>b</p></> }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/a');
    render(<Router routes={tree} />);
    await navigate('/a');
    await navigate('/b');
    expect(seen).toEqual({ pathname: '/a', search: '' });
  });
});
