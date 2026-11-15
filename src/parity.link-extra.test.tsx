import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, Outlet, Router } from './index';
import { navigate, resetRouterState, setRouterConfig } from './runtime/actions';
import type { FileRouteOptions, LinkState, RouteNode } from './types';

const RawLink = Link as unknown as (props: any) => ReturnType<typeof Link>;

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
}) as unknown as RouteNode;

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

const LinkRow = () => (
  <>
    <RawLink
      to="/about"
      data-testid="dynamic-class"
      className={({ isActive }: LinkState) => (isActive ? 'dynamic-active' : 'dynamic-inactive')}
    >
      Dynamic class
    </RawLink>
    <RawLink
      to="/about"
      data-testid="dynamic-style"
      style={({ isActive }: LinkState) => ({ color: isActive ? 'red' : 'blue', fontWeight: isActive ? 'bold' : 'normal' })}
    >
      Dynamic style
    </RawLink>
    <RawLink to="/about" data-testid="static-style" style={{ color: 'green', fontWeight: 'bold' }}>
      Static style
    </RawLink>
  </>
);

const tree = (): RouteNode => {
  const shell = ({ children }: { children: React.ReactNode }) => <><LinkRow />{children}</>;
  return node('__root__', '/', { component: () => <Outlet />, layout: shell }, [
    node('/', '/', { component: () => <h1>Home</h1> }),
    node('/about', '/about', { component: () => <p>About page</p> }),
  ]);
};

describe('Link parity: dynamic className/style flipping (original Link.test.tsx)', () => {
  it('flips the dynamic className when the link becomes active', async () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-class').className).toContain('dynamic-inactive');

    await act(async () => { await navigate('/about'); });

    const link = screen.getByTestId('dynamic-class');
    expect(link.className).toContain('dynamic-active');
    expect(link.className).not.toContain('dynamic-inactive');
  });

  it('flips the dynamic style when the link becomes active', async () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-style').style.color).toBe('blue');
    expect(screen.getByTestId('dynamic-style').style.fontWeight).toBe('normal');

    await act(async () => { await navigate('/about'); });

    expect(screen.getByTestId('dynamic-style').style.color).toBe('red');
    expect(screen.getByTestId('dynamic-style').style.fontWeight).toBe('bold');
  });

  it('applies a static style object', () => {
    renderAt('/', tree());
    const link = screen.getByTestId('static-style');
    expect(link.style.color).toBe('green');
    expect(link.style.fontWeight).toBe('bold');
  });

  it('renders children inside the anchor', () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-class').textContent).toBe('Dynamic class');
  });
});
