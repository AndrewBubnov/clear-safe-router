import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { Router, routerRuntime } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/runtime';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}): RouteNode => ({
  id, path, options, children: [],
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => ({
  id: '__root__', path: '/', options: { component: () => null }, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;

const navigate = async (target: any) => { await act(async () => { await routerRuntime.navigate(target); }); };

afterEach(() => { cleanup(); resetRouterState(); });

describe('navigate replace', () => {
  it('pushes a new history entry by default', async () => {
    const tree = root([
      node('/a', '/a'),
      node('/b', '/b'),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    const base = window.history.length;
    await navigate('/a');
    expect(window.history.length).toBe(base + 1);
  });

  it('replace: true rewrites the current entry instead of pushing', async () => {
    const tree = root([
      node('/a', '/a'),
      node('/b', '/b'),
      node('/c', '/c'),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    render(<Router routes={tree} />);
    const base = window.history.length;
    await navigate('/a');
    expect(window.history.length).toBe(base + 1);
    await navigate({ toRaw: '/b', replace: true });
    expect(window.history.length).toBe(base + 1);
    expect(window.location.pathname).toBe('/b');
    // A later plain push still works normally after a replace.
    await navigate('/c');
    expect(window.history.length).toBe(base + 2);
  });
});
