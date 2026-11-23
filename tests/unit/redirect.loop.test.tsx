import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Outlet, Router } from '../../src/index';
import { resetRouterState, setRouterConfig } from '../../src/core/actions';
import { snapshot } from '../../src/core/state';
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

describe('redirect robustness', () => {
  it('aborts a redirect loop with an error instead of hanging', async () => {
    const tree = root([node('/loop', '/loop', { beforeLoad: ({ redirect }) => redirect('/loop') })]);
    renderAt('/loop', tree);
    // Pre-fix this navigated forever; now the chain fails fast with an error.
    await waitFor(() => expect(snapshot().status).toBe('error'), { timeout: 5000 });
    const error = snapshot().errors.get('/loop');
    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe('RedirectLoopError');
    expect(error?.message).toContain('redirect loop');
  });

  it('interrupts the hook body after redirect() is called', async () => {
    const afterRedirect = vi.fn();
    const tree = root([
      node('/', '/', { component: () => <p>home</p> }),
      node('/guard', '/guard', {
        beforeLoad: async ({ redirect }) => {
          await redirect('/target');
          afterRedirect();
        },
      }),
      node('/target', '/target', { component: () => <p>target</p> }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(<Router routes={tree} />);
    await screen.findByText('home');
    await act(async () => { await window.history.pushState(null, '', '/guard'); });
    await act(async () => { await window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(window.location.pathname).toBe('/target'), { timeout: 3000 });
    await screen.findByText('target');
    expect(afterRedirect).not.toHaveBeenCalled();
  });
});
