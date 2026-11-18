import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef, memo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Outlet, Router } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/core/actions';
import { resolveComponent } from '../../src/route/lazy';
import { LAZY_MARKER } from '../../src/core/constants';
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

describe('resolveComponent with wrapped components', () => {
  it('renders React.memo components', async () => {
    const tree = root([node('/a', '/a', { component: memo(() => <p>memo page</p>) })]);
    renderAt('/a', tree);
    await screen.findByText('memo page');
  });

  it('renders forwardRef components', async () => {
    const Forwarded = forwardRef<HTMLParagraphElement>((_props, ref) => <p ref={ref}>forwarded page</p>);
    const tree = root([node('/a', '/a', { component: Forwarded })]);
    renderAt('/a', tree);
    await screen.findByText('forwarded page');
  });

  it('renders a memo wrapping one of our lazy() definitions', async () => {
    const definition = { [LAZY_MARKER]: true, importFn: async () => ({ default: () => <p>lazy memo</p> }) };
    const resolved = resolveComponent(memo(definition as never));
    expect(resolved).not.toBeNull();
    const tree = root([node('/a', '/a', { component: resolved as never })]);
    renderAt('/a', tree);
    await screen.findByText('lazy memo');
  });

  it('still returns null for non-component values', () => {
    expect(resolveComponent(null)).toBeNull();
    expect(resolveComponent(undefined)).toBeNull();
    expect(resolveComponent({ foo: 'bar' })).toBeNull();
    expect(resolveComponent(42)).toBeNull();
  });
});
