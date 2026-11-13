import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteNode } from './types';
import { Router, Link, Outlet, createFileRoute, routerRuntime } from './index';
import { resetRouterState } from './runtime';

const HomeRoute = createFileRoute('/')({ component: () => <><h1>Home</h1><Link to="/members/$memberId" params={{ memberId: '7' }}>Member</Link></> });
const MemberRoute = createFileRoute('/members/$memberId')({
  loader: async ({ params }) => ({ id: params.memberId }),
  staleTime: 30_000,
  component: () => <><h1>Member {MemberRoute.useLoaderData<{ id: string }>().id}</h1><Link to="/">Home</Link></>,
});
const RootRoute = createFileRoute('__root__')({ component: () => <Outlet /> });
const makeTree = (member: Record<string, unknown> = MemberRoute as unknown as Record<string, unknown>) => ({ ...RootRoute, path: '/', children: [
  { ...HomeRoute, path: '/', children: [] },
  { ...member, path: '/members/:memberId', children: [] },
] }) as unknown as RouteNode;
const renderRouter = (path = '/', tree = makeTree()) => {
  window.history.replaceState(null, '', path);
  return render(<Router routes={tree} notFound={<h1>Missing</h1>} />);
};

afterEach(() => { cleanup(); resetRouterState(); vi.restoreAllMocks(); });

describe('router runtime', () => {
  it('initially matches, loads and renders a nested dynamic route', async () => {
    renderRouter('/members/7');
    expect(await screen.findByText('Member 7')).toBeTruthy();
  });

  it('navigates and writes the browser URL; back/forward uses popstate navigation', async () => {
    renderRouter('/');
    await screen.findByText('Home');
    await act(async () => { screen.getByText('Member').click(); });
    expect(await screen.findByText('Member 7')).toBeTruthy();
    expect(window.location.pathname).toBe('/members/7');
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.back();
      await popped;
    });
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('renders the configured unknown route UI', async () => {
    renderRouter('/unknown/path');
    expect(await screen.findByText('Missing')).toBeTruthy();
  });

  it('does not let an obsolete loader overwrite current navigation state', async () => {
    let resolveOld!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>(resolve => { resolveOld = resolve; }));
    const pendingRoute = createFileRoute('/members/$memberId')({ loader, component: () => <p>old</p> });
    renderRouter('/', makeTree(pendingRoute));
    await screen.findByText('Home');
    const first = routerRuntime.navigate({ toRaw: '/members/7' });
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    const second = routerRuntime.navigate({ toRaw: '/' });
    await second;
    resolveOld('stale');
    await first;
    expect(screen.getByText('Home')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('reruns a cancelled loader when revisiting its URL', async () => {
    let resolveFirst!: (value: string) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce('fresh');
    const page = createFileRoute('/members/$memberId')({ loader, component: () => <p>{String(page.useLoaderData<unknown>())}</p> });
    renderRouter('/', makeTree(page));
    await screen.findByText('Home');
    const first = routerRuntime.navigate({ toRaw: '/members/7' });
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await routerRuntime.navigate({ toRaw: '/' });
    await routerRuntime.navigate({ toRaw: '/members/7' });
    resolveFirst('stale');
    await first;
    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.getByText('fresh')).toBeTruthy();
  });
});
