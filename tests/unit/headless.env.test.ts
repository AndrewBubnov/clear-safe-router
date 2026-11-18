// @vitest-environment node
// The bare core under a memory history, in plain Node: there is no `window`
// at all, so any seam bypass fails natively — no DOM globals exist to touch.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  navigate,
  resetRouterState,
  setRouterConfig,
} from '../../src/core/actions';
import { snapshot } from '../../src/core/state';
import { setRouterEnv, getRouterEnv, nullEnv, type RouterEnv } from '../../src/core/env';
import type { RouteNode } from '../../src/core/types';

/** In-memory history: writes land on a local stack, nothing else. */
const memoryEnv = (): RouterEnv & { stack: string[]; setCurrent(pathname: string, search?: string): void; emitPopState(): void } => {
  const stack: string[] = [];
  const popListeners: (() => void)[] = [];
  let current = { pathname: '/', search: '', state: null as unknown };
  const setCurrent = (pathname: string, search = '') => { current = { pathname, search, state: null }; };
  const apply = (kind: string, url: string, state: unknown) => {
    stack.push(`${kind}:${url}`);
    const [pathname, search = ''] = url.split('?');
    current = { pathname: pathname!, search: search ? `?${search}` : '', state };
  };
  return {
    stack,
    setCurrent,
    emitPopState: () => popListeners.forEach(l => l()),
    currentLocation: () => ({ ...current }),
    currentUrl: () => `${current.pathname}${current.search}`,
    push: (url, state) => apply('push', url, state),
    replace: (url, state) => apply('replace', url, state),
    back: () => stack.push('back'),
    forward: () => stack.push('forward'),
    onPopState: (listener) => { popListeners.push(listener); return () => { const i = popListeners.indexOf(listener); if (i >= 0) popListeners.splice(i, 1); }; },
    scrollTo: () => {},
    scrollPos: () => ({ top: 0, left: 0 }),
    elementById: () => null,
    scrollElementTo: () => {},
    elementScrollPos: () => ({ top: 0, left: 0 }),
    isSmallTouchDevice: () => false,
    isVisible: () => false,
    onVisibilityChange: () => () => {},
    onOnline: () => () => {},
  };
};

const node = (id: string, path: string, options: RouteNode['options'] = {}, children: RouteNode[] = []): RouteNode => ({ id: id as RouteNode['id'], path, options, children });

describe('headless core (memory env, node runtime)', () => {
  const env = memoryEnv();
  beforeEach(() => {
    setRouterEnv(env);
    resetRouterState();
  });
  afterEach(() => {
    setRouterEnv(nullEnv);
    resetRouterState();
  });

  it('the env is swappable and restorable', () => {
    setRouterEnv(env);
    expect(getRouterEnv()).toBe(env);
    setRouterEnv(nullEnv);
    expect(getRouterEnv()).toBe(nullEnv);
  });

  it('navigates through the memory stack with zero DOM access', async () => {
    setRouterConfig(node('__root__', '/', {}, [
      node('/', '/', { loader: () => 'home-data' }),
      node('/about', '/about'),
    ]));
    await navigate('/about');
    const state = snapshot();
    expect(state.status).toBe('active');
    expect(state.location.pathname).toBe('/about');
    expect(state.matches.map(m => m.route.id)).toEqual(['__root__', '/about']);
    expect(env.stack).toContain('push:/about');

    await navigate({ to: '/', replace: true });
    expect(env.stack).toContain('replace:/');
  });

  it('processes popstate through the env seam (no DOM)', async () => {
    const { handlePopState } = await import('../../src/core/actions');
    setRouterConfig(node('__root__', '/', {}, [node('/a', '/a'), node('/b', '/b')]));
    // A headless host wires the core's handler exactly like the React adapter does.
    const offPopState = env.onPopState(() => { void handlePopState(); });
    try {
      await navigate('/a');
      // The browser would have changed the URL before the popstate event fires.
      env.setCurrent('/b');
      env.emitPopState();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(snapshot().location.pathname).toBe('/b');
      expect(snapshot().status).toBe('active');
    } finally {
      offPopState();
    }
  });

  it('runs loaders and caches their data headlessly', async () => {
    setRouterConfig(node('__root__', '/', {}, [node('/data', '/data', { loader: () => Promise.resolve({ n: 42 }) })]));
    await navigate('/data');
    expect(snapshot().status).toBe('active');
    // Data flows to the store without any framework rendering.
    const { dataStore } = await import('../../src/core/state');
    const values = [...dataStore.getState().values()];
    expect(values).toContainEqual({ n: 42 });
  });
});
