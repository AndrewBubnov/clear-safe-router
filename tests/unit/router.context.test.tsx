import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Outlet, Router } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/core/actions';
import { contextStore } from '../../src/core/state';
import type { FileRouteOptions, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

afterEach(() => {
  cleanup();
  resetRouterState();
  window.history.replaceState(null, '', '/');
});

describe('Router context prop', () => {
  it('applies a new context prop after mount', async () => {
    const tree = root([node('/', '/', { component: () => <p>home</p> })]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    const { rerender } = render(<Router routes={tree} context={{ a: 1 }} />);
    await screen.findByText('home');
    expect(contextStore.getState()).toMatchObject({ a: 1 });

    rerender(<Router routes={tree} context={{ a: 1, b: 2 }} />);
    await act(async () => { await Promise.resolve(); });
    expect(contextStore.getState()).toMatchObject({ a: 1, b: 2 });
  });
});
