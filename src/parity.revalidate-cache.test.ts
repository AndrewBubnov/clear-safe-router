import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileRouteOptions, RouteMatch, RouteNode } from './types';
import { runLoader } from './runtime/cache';
import { cache, flights } from './runtime/state';
import { configureRouter } from './runtime/config';
import { navigate, prefetch, resetRouterState, setRouterConfig } from './runtime';

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

const matchFor = (options: FileRouteOptions<any>, params: Record<string, string> = {}): RouteMatch => ({
  route: node('/test', '/test', options),
  params,
  key: '/test|/test',
});

const loc = (pathname = '/test', search = '') => ({ pathname, search });
const signal = () => new AbortController().signal;
const cacheKey = (pathname = '/test', search = '') => `/test|${pathname}${search}`;

beforeEach(() => {
  configureRouter({ maxCacheSize: 100, defaultStaleTime: undefined, defaultRetry: undefined });
  vi.useFakeTimers();
});
afterEach(() => { resetRouterState(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('revalidateCache parity (original revalidateCache.test.ts)', () => {
  it('returns undefined when no loader', async () => {
    expect(await runLoader(matchFor({}), loc(), signal())).toBeUndefined();
  });

  it('calls loader and caches the result', async () => {
    const loader = vi.fn().mockResolvedValue('test data');
    const result = await runLoader(matchFor({ loader }), loc(), signal());
    expect(result).toBe('test data');
    expect(loader).toHaveBeenCalledOnce();
    expect(cache.get(cacheKey())?.value).toBe('test data');
  });

  it('returns cached data on the second call (fresh cache)', async () => {
    const loader = vi.fn().mockResolvedValue('test data');
    const match = matchFor({ loader, staleTime: 10000 });
    await runLoader(match, loc(), signal());
    expect(await runLoader(match, loc(), signal())).toBe('test data');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('refetches when no staleTime is configured', async () => {
    const loader = vi.fn().mockResolvedValueOnce('data v1').mockResolvedValueOnce('data v2');
    const match = matchFor({ loader });
    await runLoader(match, loc(), signal());
    expect(await runLoader(match, loc(), signal())).toBe('data v2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps prefetched data fresh for the preload window', async () => {
    const loader = vi.fn().mockResolvedValueOnce('prefetched').mockResolvedValueOnce('navigation data');
    const match = matchFor({ loader });
    await runLoader(match, loc(), signal(), false, 'prefetch');
    vi.advanceTimersByTime(29_000);
    expect(await runLoader(match, loc(), signal(), false, 'navigation')).toBe('prefetched');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('consumes prefetch freshness on the first navigation', async () => {
    const loader = vi.fn().mockResolvedValueOnce('prefetched').mockResolvedValueOnce('navigation data');
    const match = matchFor({ loader });
    await runLoader(match, loc(), signal(), false, 'prefetch');
    await runLoader(match, loc(), signal(), false, 'navigation');
    expect(await runLoader(match, loc(), signal(), false, 'navigation')).toBe('navigation data');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('expires prefetched data after the preload window', async () => {
    const loader = vi.fn().mockResolvedValueOnce('prefetched').mockResolvedValueOnce('navigation data');
    const match = matchFor({ loader });
    await runLoader(match, loc(), signal(), false, 'prefetch');
    vi.advanceTimersByTime(30_001);
    expect(await runLoader(match, loc(), signal(), false, 'navigation')).toBe('navigation data');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not shorten a longer route staleTime when prefetching', async () => {
    const loader = vi.fn().mockResolvedValue('prefetched');
    const match = matchFor({ loader, staleTime: 60_000 });
    await runLoader(match, loc(), signal(), false, 'prefetch');
    vi.advanceTimersByTime(40_000);
    expect(await runLoader(match, loc(), signal(), false, 'navigation')).toBe('prefetched');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('uses defaultStaleTime when the route does not set staleTime', async () => {
    configureRouter({ defaultStaleTime: 10000 });
    const loader = vi.fn().mockResolvedValue('test data');
    const match = matchFor({ loader });
    await runLoader(match, loc(), signal());
    expect(await runLoader(match, loc(), signal())).toBe('test data');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('treats staleTime: 0 as always stale', async () => {
    const loader = vi.fn().mockResolvedValueOnce('data v1').mockResolvedValueOnce('data v2');
    const match = matchFor({ loader, staleTime: 0 });
    await runLoader(match, loc(), signal());
    expect(await runLoader(match, loc(), signal())).toBe('data v2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps data fresh forever with staleTime: Infinity', async () => {
    const loader = vi.fn().mockResolvedValue('test data');
    const match = matchFor({ loader, staleTime: Infinity });
    await runLoader(match, loc(), signal());
    vi.advanceTimersByTime(1_000_000);
    expect(await runLoader(match, loc(), signal())).toBe('test data');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('refetches when the cache is stale', async () => {
    const loader = vi.fn().mockResolvedValueOnce('data v1').mockResolvedValueOnce('data v2');
    const match = matchFor({ loader, staleTime: 100 });
    await runLoader(match, loc(), signal());
    vi.advanceTimersByTime(200);
    expect(await runLoader(match, loc(), signal())).toBe('data v2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates in-flight requests', async () => {
    let resolveLoader!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>(resolve => { resolveLoader = resolve; }));
    const match = matchFor({ loader });
    const shared = signal();
    const p1 = runLoader(match, loc(), shared);
    const p2 = runLoader(match, loc(), shared);
    resolveLoader('data');
    expect(await Promise.all([p1, p2])).toEqual(['data', 'data']);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('does not cache loader errors and reruns the loader next time', async () => {
    const error = new Error('load failed');
    const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('recovered');
    const match = matchFor({ loader });
    await expect(runLoader(match, loc(), signal())).rejects.toBe(error);
    expect(cache.has(cacheKey())).toBe(false);
    expect(await runLoader(match, loc(), signal())).toBe('recovered');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('retries on failure', async () => {
    const error = new Error('fail');
    const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('retry success');
    const match = matchFor({ loader, retry: 2 });
    expect(await runLoader(match, loc(), signal())).toBe('retry success');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 });
    expect(loader.mock.calls[1]?.[0]).toMatchObject({ attempt: 2 });
  });

  it('retries with delay', async () => {
    const error = new Error('fail');
    const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('retry success');
    const match = matchFor({ loader, retry: { count: 2, delay: 100 } });
    const resultPromise = runLoader(match, loc(), signal());
    await vi.advanceTimersByTimeAsync(100);
    expect(await resultPromise).toBe('retry success');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('gives up after max retries', async () => {
    const error = new Error('persistent fail');
    const loader = vi.fn().mockRejectedValue(error);
    const match = matchFor({ loader, retry: 1 });
    await expect(runLoader(match, loc(), signal())).rejects.toBe(error);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry when the cache exceeds maxCacheSize', async () => {
    configureRouter({ maxCacheSize: 2 });
    const loader = vi.fn().mockResolvedValue('data');
    const match = matchFor({ loader, staleTime: 10000 });
    await runLoader(match, loc('/a'), signal());
    await runLoader(match, loc('/b'), signal());
    await runLoader(match, loc('/c'), signal());
    expect(cache.size).toBe(2);
    expect(cache.has('/test|/a')).toBe(false);
    expect(cache.has('/test|/b')).toBe(true);
    expect(cache.has('/test|/c')).toBe(true);
  });

  it('does not evict the current route when a prefetch fills the cache', async () => {
    configureRouter({ maxCacheSize: 2 });
    const loader = vi.fn().mockResolvedValue('new data');
    const tree = node('__root__', '/', {}, [
      node('/live', '/live', { loader, staleTime: 10000 }),
      node('/other', '/other', { loader, staleTime: 10000 }),
      node('/new', '/new', { loader, staleTime: 10000 }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/live?tab=1');
    await navigate('/live?tab=1');
    expect(cache.has('/live|/live?tab=1')).toBe(true);
    await prefetch('/other');
    await prefetch('/new');
    expect(cache.has('/live|/live?tab=1')).toBe(true);
    expect(cache.has('/other|/other')).toBe(false);
    expect(cache.has('/new|/new')).toBe(true);
  });

  it('does not cache when the signal is aborted', async () => {
    const loader = vi.fn().mockImplementation(
      (args: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => _resolve('data'), 1000);
          args.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
        })
    );
    const match = matchFor({ loader });
    const controller = new AbortController();
    const promise = runLoader(match, loc(), controller.signal);
    controller.abort();
    vi.advanceTimersByTime(100);
    expect(await promise).toBeUndefined();
    expect(cache.has(cacheKey())).toBe(false);
  });

  it('uses default retry from routerConfig', async () => {
    configureRouter({ defaultRetry: { count: 1, delay: 0 } });
    const error = new Error('fail');
    const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');
    expect(await runLoader(matchFor({ loader }), loc(), signal())).toBe('success');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('route retry overrides global retry', async () => {
    configureRouter({ defaultRetry: { count: 5, delay: 0 } });
    const loader = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(runLoader(matchFor({ loader, retry: 1 }), loc(), signal())).rejects.toThrow('fail');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('navigation cancels an in-flight prefetch for the same path', async () => {
    const loader = vi.fn()
      .mockImplementationOnce((args: { signal: AbortSignal }) => new Promise<string>((_resolve, reject) => {
        args.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }))
      .mockResolvedValueOnce('navigation data');
    const tree = node('__root__', '/', {}, [
      node('/', '/', {}),
      node('/test', '/test', { loader }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    await navigate('/');
    const prefetching = prefetch('/test');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await navigate('/test');
    await prefetching;
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.get(cacheKey())?.value).toBe('navigation data');
  });

  it('deduplicates concurrent navigations with different signals', async () => {
    let resolveLoader!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>(resolve => { resolveLoader = resolve; }));
    const match = matchFor({ loader });
    const p1 = runLoader(match, loc(), signal());
    const p2 = runLoader(match, loc(), signal());
    resolveLoader('data');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('data');
    expect(r1).toBe(r2);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('does not let a cancelled prefetch overwrite newer navigation data', async () => {
    let resolvePrefetch!: (value: string) => void;
    let resolveNavigation!: (value: string) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolvePrefetch = resolve; }))
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveNavigation = resolve; }));
    const tree = node('__root__', '/', {}, [
      node('/', '/', {}),
      node('/test', '/test', { loader }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    await navigate('/');
    const prefetching = prefetch('/test');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    const navigation = navigate('/test');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    resolveNavigation('new data');
    await navigation;
    resolvePrefetch('old data');
    await prefetching;
    expect(cache.get(cacheKey())?.value).toBe('new data');
  });

  it('aborted prefetch cleanup does not remove the navigation entry', async () => {
    let resolveNav!: (value: string) => void;
    const loader = vi.fn()
      .mockImplementationOnce((args: { signal: AbortSignal }) => new Promise<string>((_resolve, reject) => {
        args.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }))
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveNav = resolve; }));
    const tree = node('__root__', '/', {}, [
      node('/', '/', {}),
      node('/test', '/test', { loader }),
    ]);
    setRouterConfig(tree);
    window.history.replaceState(null, '', '/');
    await navigate('/');
    const prefetching = prefetch('/test');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    const navigation = navigate('/test');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    await prefetching;
    expect(flights.has(cacheKey())).toBe(true);
    resolveNav('nav data');
    await navigation;
    expect(cache.get(cacheKey())?.value).toBe('nav data');
    expect(flights.has(cacheKey())).toBe(false);
  });
});
