import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRouterState, setRouterConfig, navigate } from '../../src/core/actions';
import { snapshot } from '../../src/core/state';
import { setRouterEnv, getRouterEnv, type RouterEnv } from '../../src/core/env';
import { browserEnv } from '../../src/browser-env';
import type { RouteNode } from '../../src/core/types';

/**
 * Headless proof: the core state machine runs against a memory history with
 * zero DOM access — `window` globals are bombed during navigation so any seam
 * bypass fails loudly. Reads of the current location are legitimate
 * (bootstrap, revert checks), so they are delegated, not bombed.
 */

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

describe('headless core (memory env)', () => {
  const env = memoryEnv();
  /** Bombs every DOM global the core could bypass the seam with. */
  const armWindowBomb = () => {
    const originals: [string, unknown][] = [];
    const bomb = (name: string, object: any, key: string) => {
      originals.push([`${name}.${key}`, object[key]]);
      object[key] = () => { throw new Error(`bypassed env seam via ${name}.${key}`); };
    };
    bomb('window.history', window.history, 'pushState');
    bomb('window.history', window.history, 'replaceState');
    bomb('window.history', window.history, 'back');
    bomb('window.history', window.history, 'forward');
    bomb('window', window, 'scrollTo');
    bomb('window', window, 'matchMedia');
    bomb('document', document, 'getElementById');
    bomb('document', document, 'startViewTransition');
    return () => {
      for (const [path, value] of originals.reverse()) {
        const [owner, key] = path.split('.').slice(-2);
        const object = (owner === 'document' ? document : owner === 'history' ? window.history : window) as unknown as Record<string, unknown>;
        object[key!] = value;
      }
    };
  };
  beforeEach(() => {
    setRouterEnv(env);
    resetRouterState();
  });
  afterEach(() => {
    setRouterEnv(browserEnv);
    resetRouterState();
  });

  it('navigates without touching any DOM global, writing to the memory stack instead', async () => {
    const disarm = armWindowBomb();
    try {
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
    } finally {
      disarm();
    }
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
    // Data flows to the store without any React rendering.
    const { dataStore } = await import('../../src/core/state');
    const values = [...dataStore.getState().values()];
    expect(values).toContainEqual({ n: 42 });
  });

  it('env can be swapped and restored; the bare core defaults to nullEnv', async () => {
    // A fresh module graph without the adapter barrel shows the core's own
    // default: nullEnv. The React adapter is the one that wires browserEnv.
    vi.resetModules();
    const fresh = await import('../../src/core/env');
    expect(fresh.getRouterEnv()).toBe(fresh.nullEnv);

    setRouterEnv(env);
    expect(getRouterEnv()).toBe(env);
    setRouterEnv(browserEnv);
    expect(getRouterEnv()).toBe(browserEnv);
  });
});
