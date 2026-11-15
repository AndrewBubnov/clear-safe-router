import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazy } from './index';
import { navigate, prefetch, resetRouterState, setRouterConfig } from './runtime/actions';
import { cache } from './runtime/state';
import type { FileRouteOptions, RouteNode } from './types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => null }, children);

const cachedUrls = () => [...cache.keys()].map(key => key.slice(key.indexOf('|') + 1));

const mockMatchMedia = (mobile: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn((query: string) => ({ matches: mobile, media: query })),
    configurable: true,
  });
};

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  resetRouterState();
  Object.defineProperty(window, 'matchMedia', { value: originalMatchMedia, configurable: true });
});

describe('prefetch parity (original prefetch.test.ts)', () => {
  it('fetches loader data for a valid route and stores it in the cache', async () => {
    const loader = vi.fn(async () => 'data');
    setRouterConfig(root([node('/test', '/test', { loader })]));

    await prefetch('/test');

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cachedUrls()).toContain('/test');
  });

  it('skips the fetch when already at the target location', async () => {
    const loader = vi.fn(async () => 'data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test');
    loader.mockClear();

    await prefetch('/test');

    expect(loader).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/');
  });

  it('fetches when only the search differs from the current location', async () => {
    const loader = vi.fn(async () => 'data');
    setRouterConfig(root([node('/test', '/test', { loader })]));
    await navigate('/test?a=1');
    loader.mockClear();

    await prefetch('/test?b=2');

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cachedUrls()).toContain('/test?b=2');
    window.history.replaceState(null, '', '/');
  });

  it('does nothing for an unknown route', async () => {
    const loader = vi.fn(async () => 'data');
    setRouterConfig(root([node('/known', '/known', { loader })]));

    await prefetch('/unknown');

    expect(loader).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('preloads the lazy chunk of the matched route', async () => {
    const importFn = vi.fn(async () => ({ default: () => null }));
    const component = lazy(importFn);
    setRouterConfig(root([node('/lazy', '/lazy', { component })]));

    await prefetch('/lazy');

    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('limits concurrency to 2 on small coarse-pointer screens (original isMobile)', async () => {
    mockMatchMedia(true);
    const resolvers: Array<() => void> = [];
    const loader = vi.fn(() => new Promise<string>(resolve => { resolvers.push(() => resolve('data')); }));
    setRouterConfig(root(['/m0', '/m1', '/m2', '/m3'].map(path => node(path, path, { loader }))));

    const all = Promise.all(['/m0', '/m1', '/m2', '/m3'].map(path => prefetch(path)));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(loader).toHaveBeenCalledTimes(2);

    resolvers.shift()!();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(loader).toHaveBeenCalledTimes(3);

    resolvers.shift()!();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(loader).toHaveBeenCalledTimes(4);

    resolvers.splice(0).forEach(resolve => resolve());
    await all;
  });

  it('falls back to desktop concurrency when matchMedia is unavailable', async () => {
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });
    const resolvers: Array<() => void> = [];
    const loader = vi.fn(() => new Promise<string>(resolve => { resolvers.push(() => resolve('data')); }));
    setRouterConfig(root(['/d0', '/d1', '/d2', '/d3', '/d4'].map(path => node(path, path, { loader }))));

    const all = Promise.all(['/d0', '/d1', '/d2', '/d3', '/d4'].map(path => prefetch(path)));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(loader).toHaveBeenCalledTimes(4);

    resolvers.shift()!();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(loader).toHaveBeenCalledTimes(5);

    resolvers.splice(0).forEach(resolve => resolve());
    await all;
  });
});
