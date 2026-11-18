import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import { useSubmitAction } from '../../src/index';
import { cache, snapshot } from '../../src/core/state';
import { configureRouter } from '../../src/core/config';
import {
  getBlockedTarget,
  navigate,
  resetRouterState,
  setBlockerStatus,
  setRouterConfig,
} from '../../src/runtime';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
  useParams: () => ({}),
  useSearch: () => ({}),
  useLoaderData: () => undefined,
  useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => null }, children);

const setStartViewTransition = (value: Document['startViewTransition'] | undefined) => {
  if (value === undefined) Reflect.deleteProperty(document, 'startViewTransition');
  else Object.defineProperty(document, 'startViewTransition', { value, configurable: true });
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  configureRouter({
    isAnimated: false,
    animationDuration: undefined,
    maxCacheSize: 100,
    defaultStaleTime: undefined,
    defaultRetry: undefined,
    defaultBeforeLoad: undefined,
    defaultAfterLoad: undefined,
  });
});
afterEach(() => {
  cleanup();
  resetRouterState();
  setStartViewTransition(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('navigate parity (original navigate.test.ts)', () => {
  it('navigates to a route and commits state', async () => {
    const loader = vi.fn().mockResolvedValue('route data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test');
    expect(snapshot().location.pathname).toBe('/test');
    expect(snapshot().status).toBe('active');
    expect(snapshot().data.get('/test|/test')).toBe('route data');
  });

  it('warns in dev when no route matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setRouterConfig(root([node('/known', '/known')]));
    await navigate('/missing/page');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No route matched'));
  });

  it('does not warn when a catch-all route matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setRouterConfig(root([node('*', '*')]));
    await navigate('/missing/catchall');
    expect(warn).not.toHaveBeenCalled();
  });

  it('sets pending status while the loader is running', async () => {
    let resolveLoader!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>(resolve => { resolveLoader = resolve; }));
    setRouterConfig(root([node('/test', '/test', { loader })]));
    const navigation = navigate('/test');
    expect(snapshot().status).toBe('pending');
    await Promise.resolve();
    resolveLoader('data');
    await navigation;
    expect(snapshot().status).toBe('active');
  });

  it('skips navigation when blocked', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    setBlockerStatus('charged');
    await navigate('/test');
    expect(getBlockedTarget()?.pathname).toBe('/test');
    expect(snapshot().status).toBe('idle');
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps the first target when navigation is attempted again while blocked', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([
      node('/test', '/test', { loader }),
      node('/other', '/other', { loader }),
    ]));
    setBlockerStatus('charged');
    await navigate('/test');
    expect(getBlockedTarget()?.pathname).toBe('/test');
    await navigate('/other');
    expect(getBlockedTarget()?.pathname).toBe('/test');
    expect(snapshot().location.pathname).toBe('/');
    expect(snapshot().status).toBe('idle');
  });

  it('runs beforeLoad', async () => {
    const beforeLoad = vi.fn();
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader, beforeLoad })]));
    await navigate('/test');
    expect(beforeLoad).toHaveBeenCalled();
  });

  it('handles beforeLoad errors', async () => {
    const beforeLoadError = new Error('auth failed');
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader, beforeLoad: vi.fn().mockRejectedValue(beforeLoadError) })]));
    await navigate('/test');
    expect(snapshot().status).toBe('error');
    expect(snapshot().errors.get('/test')).toBe(beforeLoadError);
    expect(snapshot().location.pathname).toBe('/test');
  });

  it('shows the error state of the target route when leaving an active page', async () => {
    const beforeLoadError = new Error('auth failed');
    setRouterConfig(root([
      node('/a', '/a'),
      node('/b', '/b', { beforeLoad: vi.fn().mockRejectedValue(beforeLoadError) }),
    ]));
    await navigate('/a');
    expect(snapshot().status).toBe('active');
    await navigate('/b');
    expect(snapshot().status).toBe('error');
    expect(snapshot().location.pathname).toBe('/b');
    expect(snapshot().matches.at(-1)?.route.id).toBe('/b');
    expect(snapshot().errors.get('/b')).toBe(beforeLoadError);
    expect(window.location.pathname).toBe('/b');
  });

  it('runs defaultBeforeLoad', async () => {
    const defaultBeforeLoad = vi.fn();
    configureRouter({ defaultBeforeLoad });
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test');
    expect(defaultBeforeLoad).toHaveBeenCalled();
  });

  it('handles loader errors', async () => {
    const loaderError = new Error('server error');
    const loader = vi.fn().mockRejectedValue(loaderError);
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test');
    expect(snapshot().status).toBe('error');
    expect(snapshot().errors.get('/test')).toBe(loaderError);
  });

  it('skips a stale loader when cache is fresh', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader, staleTime: 10000 })]));
    await navigate('/test');
    expect(loader).toHaveBeenCalledOnce();
    await navigate('/test');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('aborts the previous navigation', async () => {
    let resolveFirst!: (value: string) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce('second');
    setRouterConfig(root([
      node('/test', '/test', { loader }),
      node('/other', '/other', { loader }),
    ]));
    const first = navigate('/test');
    await Promise.resolve();
    const second = navigate('/other');
    resolveFirst('stale');
    await first;
    await second;
    expect(snapshot().location.pathname).toBe('/other');
    expect(snapshot().data.get('/other|/other')).toBe('second');
  });

  it('navigates with search params', async () => {
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test?foo=bar');
    expect(snapshot().location.search).toBe('?foo=bar');
    expect(cache.has('/test|/test?foo=bar')).toBe(true);
  });

  it('calls afterLoad asynchronously', async () => {
    const afterLoad = vi.fn();
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([node('/test', '/test', { loader, afterLoad })]));
    await navigate('/test');
    expect(afterLoad).toHaveBeenCalled();
  });

  it('runs defaultAfterLoad and logs errors when afterLoad fails', async () => {
    const routeError = new Error('route afterLoad failed');
    const defaultError = new Error('default afterLoad failed');
    const afterLoad = vi.fn().mockRejectedValue(routeError);
    const defaultAfterLoad = vi.fn().mockRejectedValue(defaultError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    configureRouter({ defaultAfterLoad });
    setRouterConfig(root([node('/test', '/test', { afterLoad })]));
    await expect(navigate('/test')).resolves.toBeUndefined();
    expect(afterLoad).toHaveBeenCalledOnce();
    expect(defaultAfterLoad).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith('[clear-safe-router] afterLoad failed:', routeError);
    expect(consoleError).toHaveBeenCalledWith('[clear-safe-router] afterLoad failed:', defaultError);
  });

  it('calls defaultAfterLoad', async () => {
    const defaultAfterLoad = vi.fn();
    configureRouter({ defaultAfterLoad });
    setRouterConfig(root([node('/test', '/test', { loader: vi.fn().mockResolvedValue('data') })]));
    await navigate('/test');
    expect(defaultAfterLoad).toHaveBeenCalled();
  });

  it('redirect in beforeLoad triggers a new navigation', async () => {
    const targetLoader = vi.fn().mockResolvedValue('redirect target data');
    setRouterConfig(root([
      node('/target', '/target', { loader: targetLoader }),
      node('/source', '/source', {
        loader: vi.fn().mockResolvedValue('source data'),
        beforeLoad: async ({ redirect }) => { await redirect('/target'); },
      }),
    ]));
    await navigate('/source');
    expect(snapshot().location.pathname).toBe('/target');
    expect(snapshot().data.get('/target|/target')).toBe('redirect target data');
  });

  it('sets a GC timeout on the previous route when navigating away', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue('data');
    setRouterConfig(root([
      node('/gc', '/gc', { loader, gcTime: 5000 }),
      node('/other', '/other', { loader }),
    ]));
    await navigate('/gc');
    expect(cache.has('/gc|/gc')).toBe(true);
    await navigate('/other');
    expect(cache.has('/gc|/gc')).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(cache.has('/gc|/gc')).toBe(false);
  });

  it('route without a loader just commits state', async () => {
    setRouterConfig(root([node('/test', '/test')]));
    await navigate('/test');
    expect(snapshot().location.pathname).toBe('/test');
    expect(snapshot().status).toBe('active');
  });

  it('minLoaderDuration delays the response', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue('fast data');
    setRouterConfig(root([node('/test', '/test', { loader, minLoaderDuration: 500 })]));
    const navigation = navigate('/test');
    await vi.advanceTimersByTimeAsync(500);
    await navigation;
    expect(snapshot().data.get('/test|/test')).toBe('fast data');
  });

  it('does not apply minLoaderDuration when cache is fresh', async () => {
    const loader = vi.fn().mockResolvedValue('fresh');
    setRouterConfig(root([node('/test', '/test', { loader, staleTime: 10000, minLoaderDuration: 500 })]));
    await navigate('/test');
    expect(loader).toHaveBeenCalledOnce();
    loader.mockClear();
    await navigate('/test');
    expect(loader).not.toHaveBeenCalled();
    expect(snapshot().data.get('/test|/test')).toBe('fresh');
  });

  it('pairs the optimistic route and loader data in a single atomic snapshot', async () => {
    let resolveRevalidation!: (value: { value: number }) => void;
    const optimisticLoader = vi.fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockImplementationOnce(() => new Promise<{ value: number }>(resolve => { resolveRevalidation = resolve; }));
    setRouterConfig(root([
      node('/slow', '/slow', { loader: vi.fn().mockResolvedValue('slow payload') }),
      node('/fast', '/fast', { loader: optimisticLoader, staleTime: 100, optimistic: true }),
    ]));
    vi.useFakeTimers();
    await navigate('/fast');
    await navigate('/slow');
    expect(snapshot().location.pathname).toBe('/slow');
    expect(snapshot().data.get('/slow|/slow')).toBe('slow payload');
    vi.advanceTimersByTime(200);
    const revisit = navigate('/fast');
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot().location.pathname).toBe('/fast');
    expect(snapshot().status).toBe('optimistic');
    expect(snapshot().data.get('/fast|/fast')).toEqual({ value: 1 });
    resolveRevalidation({ value: 2 });
    await revisit;
    expect(snapshot().status).toBe('active');
    expect(snapshot().data.get('/fast|/fast')).toEqual({ value: 2 });
  });

  it('commits navigation synchronously when startViewTransition throws', async () => {
    setStartViewTransition(() => { throw new Error('startViewTransition is not supported'); });
    configureRouter({ isAnimated: true });
    const loader = vi.fn().mockResolvedValue('fallback data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test');
    expect(snapshot().status).toBe('active');
    expect(snapshot().data.get('/test|/test')).toBe('fallback data');
    expect(snapshot().location.pathname).toBe('/test');
  });

  describe('polling', () => {
    it('updates loader data on every polling tick while the route is active', async () => {
      vi.useFakeTimers();
      const loader = vi.fn().mockResolvedValueOnce('v1').mockResolvedValue('v2');
      setRouterConfig(root([node('/test', '/test', { loader, pollingInterval: 1000, staleTime: 500 })]));
      await navigate('/test');
      expect(snapshot().data.get('/test|/test')).toBe('v1');
      expect(loader).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(loader).toHaveBeenCalledTimes(2);
      expect(loader.mock.calls.length).toBeGreaterThan(1);
      const { dataStore } = await import('../../src/core/state');
      expect(dataStore.getState().get('/test|/test')).toBe('v2');
    });

    it('refetches on every polling tick even with an always-fresh cache', async () => {
      vi.useFakeTimers();
      const loader = vi.fn().mockResolvedValueOnce('v1').mockResolvedValue('v2');
      setRouterConfig(root([node('/test', '/test', { loader, pollingInterval: 1000, staleTime: Infinity })]));
      await navigate('/test');
      expect(loader).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('stops polling after leaving the route', async () => {
      vi.useFakeTimers();
      const loader = vi.fn().mockResolvedValue('v1');
      setRouterConfig(root([
        node('/test', '/test', { loader, pollingInterval: 1000, staleTime: 500 }),
        node('/other', '/other'),
      ]));
      await navigate('/test');
      expect(loader).toHaveBeenCalledTimes(1);
      await navigate('/other');
      await vi.advanceTimersByTimeAsync(5000);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('useSubmitAction (original useAction)', () => {
    it('calls the current route action after navigation', async () => {
      const actionA = vi.fn(async () => 'saved-a');
      const actionB = vi.fn(async () => 'saved-b');
      setRouterConfig(root([
        node('/a', '/a', { actions: () => ({ save: actionA }) }),
        node('/b', '/b', { actions: () => ({ save: actionB }) }),
      ]));
      await navigate('/a');
      const { result } = renderHook(() => useSubmitAction('save'));
      await navigate('/b');
      let submitResult: unknown;
      await act(async () => { submitResult = await result.current.submit({ title: 'hello' }); });
      expect(actionB).toHaveBeenCalledWith({ title: 'hello' });
      expect(actionA).not.toHaveBeenCalled();
      expect(submitResult).toEqual({ data: 'saved-b', error: null });
    });

    it('returns an error instead of crashing when the action is missing', async () => {
      setRouterConfig(root([node('/a', '/a', { actions: () => ({}) })]));
      await navigate('/a');
      let submit!: (input: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
      expect(() => {
        const { result } = renderHook(() => useSubmitAction('missing'));
        submit = result.current.submit;
      }).not.toThrow();
      let submitResult: { data: unknown; error: unknown } | undefined;
      await act(async () => { submitResult = await submit({}); });
      expect(submitResult?.data).toBeNull();
      expect(submitResult?.error).toBeInstanceOf(Error);
    });

    it('invalidates the route where the action started after navigating away mid-flight', async () => {
      let resolveAction!: (value: string) => void;
      const action = vi.fn(() => new Promise<string>(resolve => { resolveAction = resolve; }));
      const loaderA = vi.fn().mockResolvedValueOnce('a1').mockResolvedValueOnce('a2');
      const loaderB = vi.fn(async () => 'b1');
      setRouterConfig(root([
        node('/a', '/a', { loader: loaderA, actions: () => ({ save: action }) }),
        node('/b', '/b', { loader: loaderB }),
      ]));
      await navigate('/a?tab=1');
      const { result } = renderHook(() => useSubmitAction('save'));
      let submitPromise!: Promise<unknown>;
      await act(async () => { submitPromise = result.current.submit({}); });
      await navigate('/b');
      await act(async () => { resolveAction('saved'); await submitPromise; });
      expect(loaderA).toHaveBeenCalledTimes(2);
      expect(loaderB).toHaveBeenCalledTimes(1);
    });

    it('invalidates the current route and calls onSuccess after submit', async () => {
      const loader = vi.fn(async () => 'v1');
      const action = vi.fn(async () => 'saved');
      const onSuccess = vi.fn();
      setRouterConfig(root([node('/a', '/a', { loader, actions: () => ({ save: action }) })]));
      await navigate('/a');
      expect(loader).toHaveBeenCalledTimes(1);
      const { result } = renderHook(() => useSubmitAction('save', { onSuccess }));
      let submitResult: unknown;
      await act(async () => { submitResult = await result.current.submit({}); });
      expect(submitResult).toEqual({ data: 'saved', error: null });
      expect(onSuccess).toHaveBeenCalledWith('saved');
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe('navigate with path params', () => {
    it('navigates by path template and params', async () => {
      const loader = vi.fn(async () => 'user data');
      setRouterConfig(root([node('/user/$id', '/user/:id', { loader })]));
      // Synthetic '/user/$id' is not in the generated RouteId union; bypass compile-time checking.
      await navigate({ to: '/user/$id', params: { id: '7' } } as never);
      expect(snapshot().location.pathname).toBe('/user/7');
      expect(snapshot().matches.at(-1)?.params).toEqual({ id: '7' });
      expect(window.location.pathname).toBe('/user/7');
    });
  });
});
