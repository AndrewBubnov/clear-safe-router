import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileRoute, routerRuntime, useBlocker } from './index';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { RouteNode } from './types';
import { resetRouterState, setRouterConfig, useRouterSnapshot } from './runtime';

const Root = createFileRoute('__root__')({});
const makeRoot = (children: RouteNode[]) => ({ ...Root, path: '/', children }) as unknown as RouteNode;
const route = (id: string, path: string, options: Record<string, unknown>) => ({ id, path, options, useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle', children: [] }) as unknown as RouteNode;

afterEach(() => { cleanup(); resetRouterState(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('cache and lifecycle behavior', () => {
  it('uses fresh cache, invalidates, and evicts least-recently-used entries', async () => {
    let calls = 0;
    const items = route('/items', '/items', { loader: async () => ++calls, staleTime: Infinity });
    const other = route('/other', '/other', { loader: async () => ++calls, staleTime: Infinity });
    setRouterConfig(makeRoot([items, other]), 1);
    await routerRuntime.navigate('/items');
    await routerRuntime.navigate('/items');
    expect(calls).toBe(1);
    await routerRuntime.invalidate('/items');
    expect(calls).toBe(2);
    await routerRuntime.navigate('/other');
    expect(calls).toBe(3);
    await routerRuntime.navigate('/items');
    expect(calls).toBe(4);
  });

  it('prefetches using the cache and dynamic invalidation only refetches cached concrete URLs', async () => {
    const seen: string[] = [];
    const item = route('/items/$itemId', '/items/:itemId', { loader: async ({ params }: { params: { itemId: string } }) => { seen.push(params.itemId); return params.itemId; }, staleTime: Infinity });
    setRouterConfig(makeRoot([item]), 10);
    await routerRuntime.prefetch('/items/1');
    await routerRuntime.navigate('/items/1');
    await routerRuntime.navigate('/items/2');
    await routerRuntime.invalidate('/items/:itemId');
    expect(seen).toEqual(['1', '2', '1', '2']);
  });

  it('cancels gc timers when a cached route becomes active again', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const items = route('/items', '/items', { loader: async () => ++calls, staleTime: Infinity, gcTime: 100 });
    const other = route('/other', '/other', {});
    setRouterConfig(makeRoot([items, other]));
    await routerRuntime.navigate('/items');
    await routerRuntime.navigate('/other');
    vi.advanceTimersByTime(50);
    await routerRuntime.navigate('/items');
    vi.advanceTimersByTime(100);
    await routerRuntime.navigate('/other');
    await routerRuntime.navigate('/items');
    expect(calls).toBe(1);
  });

  it('retries loader failures and commits an error state after retry exhaustion', async () => {
    let calls = 0;
    const flaky = route('/items', '/items', { loader: async () => { calls++; if (calls === 1) throw new Error('temporary'); return 'ok'; }, retry: 1 });
    const broken = route('/broken', '/broken', { loader: async () => { throw new Error('down'); }, retry: { count: 1, delay: 0 } });
    setRouterConfig(makeRoot([flaky, broken]));
    await routerRuntime.navigate('/items');
    expect(calls).toBe(2);
    await routerRuntime.navigate('/broken');
    const { result } = renderHook(() => useRouterSnapshot());
    expect(result.current.status).toBe('error');
    expect(result.current.errors.get('/broken')?.message).toBe('down');
  });

  it('blocks programmatic navigation until the blocked target is confirmed', async () => {
    window.history.replaceState(null, '', '/');
    const blocker = vi.fn(() => true);
    const { result } = renderHook(() => useBlocker(blocker));
    setRouterConfig(makeRoot([route('/items', '/items', {})]));
    await act(async () => { await routerRuntime.navigate('/items'); });
    expect(window.location.pathname).not.toBe('/items');
    await act(async () => { await result.current.proceed(); });
    expect(window.location.pathname).toBe('/items');
  });

  it('runs afterLoad failures without rejecting navigation and beforeLoad can redirect', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source = route('/items', '/items', { beforeLoad: async ({ redirect }: { redirect: (to: string) => Promise<void> }) => redirect('/other'), afterLoad: async () => { throw new Error('analytics'); } });
    const target = route('/other', '/other', { afterLoad: async () => { throw new Error('analytics'); } });
    setRouterConfig(makeRoot([source, target]));
    await expect(routerRuntime.navigate('/items')).resolves.toBeUndefined();
    expect(window.location.pathname).toBe('/other');
    expect(error).toHaveBeenCalled();
  });
});
