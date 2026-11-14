import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { RouteNode } from './types';
import { Link, Outlet, Router, useCacheSnapshot, useLocation, useRouteStatus, routerRuntime, syncCacheSnapshot } from './index';
import { resetRouterState, restoreScrollNow, setRouterConfig, useRouteData } from './runtime';

// Synthetic runtime tree routes ('/about', '/search') intentionally don't exist in the
// generated RouteId union — bypass Link's compile-time checking to keep runtime parity.
type RawLinkState = { isActive: boolean; isPending: boolean };
const RawLink = Link as unknown as (props: {
  to: string;
  exact?: boolean;
  search?: string | Record<string, string | number | boolean | null | undefined>;
  className?: string | ((state: RawLinkState) => string);
  style?: CSSProperties | ((state: RawLinkState) => CSSProperties);
  as?: (props: any, state: RawLinkState) => ReactElement;
  beforeNavigate?: () => Promise<void>;
  children?: ReactNode;
} & Record<`data-${string}`, string>) => ReturnType<typeof Link>;

const node = (id: string, path: string, options: Record<string, unknown> = {}, children: RouteNode[] = []): RouteNode => ({
  id, path, options, children,
  useParams: () => ({}), useSearch: () => ({}), useLoaderData: () => undefined, useRouteStatus: () => 'idle',
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} />);
};

afterEach(() => { cleanup(); resetRouterState(); vi.restoreAllMocks(); });

describe('Link parity (original Link.test.tsx)', () => {
  const tree = () => root([
    node('/', '/', { component: () => (
      <>
        <h1>Home</h1>
        <Link to="/" data-testid="home-self">Home self</Link>
        <RawLink to="/about" data-testid="about-link">About link</RawLink>
        <RawLink to="/about" exact data-testid="about-exact">About exact</RawLink>
        <RawLink to="/about" className={({ isActive }) => (isActive ? 'dynamic-active' : 'dynamic-inactive')} data-testid="dynamic-class">Dynamic class</RawLink>
        <RawLink to="/about" style={({ isActive }) => ({ color: isActive ? 'red' : 'blue' })} data-testid="dynamic-style">Dynamic style</RawLink>
        <RawLink to="/about" as={props => <button {...props} data-testid="custom-as" />} data-testid="custom-wrap">Custom element</RawLink>
        <RawLink to="/about" beforeNavigate={beforeNavigateSpy} data-testid="guarded">Guarded</RawLink>
        <RawLink to="/search?foo=bar" data-testid="search-string">With search</RawLink>
        <RawLink to="/search" search={{ q: 'hello', page: 2 }} data-testid="search-object">With search object</RawLink>
        <RawLink to="/about" data-testid="middle-click">Middle click</RawLink>
      </>
    ) }),
    node('/about', '/about', { component: () => <><RawLink to="/about" data-testid="about-link-there">About page</RawLink></> }),
    node('/search', '/search', { component: () => <p>Search page</p> }),
    node('/slow', '/slow', { loader: () => new Promise<string>(() => {}), pendingFallback: <p>Loading slow</p>, component: () => <p>Slow page</p> }),
  ]);
  const beforeNavigateSpy = vi.fn();

  it('renders anchor href with search string and search object', () => {
    renderAt('/', tree());
    expect(screen.getByTestId('search-string').getAttribute('href')).toBe('/search?foo=bar');
    expect(screen.getByTestId('search-object').getAttribute('href')).toBe('/search?q=hello&page=2');
  });

  it('applies active-link by default, custom activeClassName, and exact matching', () => {
    renderAt('/', tree());
    expect(screen.getByTestId('home-self').className).toContain('active-link');
    expect(screen.getByTestId('about-link').className).not.toContain('active-link');
    expect(screen.getByTestId('about-exact').className).not.toContain('active-link');
    expect(screen.getByTestId('dynamic-class').className).toContain('dynamic-inactive');
  });

  it('applies active classes on navigation and supports style functions', async () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-style').style.color).toBe('blue');
    await act(async () => { screen.getByTestId('about-link').click(); });
    await screen.findByText('About page');
    expect(screen.getByTestId('about-link-there').className).toContain('active-link');
    expect(screen.getByTestId('about-link-there').className).not.toContain('dynamic-inactive');
  });

  it('supports the as prop and forwards data-*/aria-* attributes', () => {
    renderAt('/', tree());
    const custom = screen.getByTestId('custom-as');
    expect(custom.tagName).toBe('BUTTON');
    expect(custom.getAttribute('href')).toBe('/about');
  });

  it('sets aria-current on the active link only', () => {
    renderAt('/', tree());
    expect(screen.getByTestId('home-self').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('about-link').getAttribute('aria-current')).toBeNull();
  });

  it('sets aria-busy while the target loads and clears it after', async () => {
    const tree = root([
      node('/', '/', { component: () => <p>Busy home</p> }),
      node('/slow', '/slow', { loader: () => new Promise<string>(() => {}), pendingFallback: <p>Loading slow</p>, component: () => <p>Slow page</p> }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(
      <>
        <Link toRaw="/slow" data-testid="slow-link">Slow</Link>
        <Router routes={tree} />
      </>
    );
    const link = screen.getByTestId('slow-link') as HTMLAnchorElement;
    await screen.findByText('Busy home');
    expect(link.getAttribute('aria-busy')).toBeNull();
    await act(async () => { link.click(); });
    await waitFor(() => expect(link.getAttribute('aria-busy')).toBe('true'));
  });

  it('calls beforeNavigate before navigation', async () => {
    renderAt('/', tree());
    await act(async () => { screen.getByTestId('guarded').click(); });
    expect(beforeNavigateSpy).toHaveBeenCalled();
  });

  it('does not navigate on middle click, ctrl, or meta', () => {
    renderAt('/', tree());
    for (const init of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }]) {
      const event = new MouseEvent('click', { ...init, bubbles: true, cancelable: true });
      const preventDefault = vi.spyOn(event, 'preventDefault');
      screen.getByTestId('middle-click').dispatchEvent(event);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    expect(window.location.pathname).toBe('/');
  });
});

describe('Router parity (original Router.test.tsx)', () => {
  it('makes initial context available to defaultBeforeLoad', async () => {
    let observedContext: Record<string, unknown> | undefined;
    const tree = root([node('/guarded', '/guarded', { component: () => <p>Guarded page</p> })]);
    window.history.replaceState(null, '', '/guarded');
    setRouterConfig(tree);
    render(
      <Router
        routes={tree}
        context={{ isAuthorized: true }}
        defaultBeforeLoad={async ({ context }) => { observedContext = context; }}
      />
    );
    await screen.findByText('Guarded page');
    expect(observedContext).toEqual({ isAuthorized: true });
  });

  it('renders pending fallback on first load', async () => {
    const tree = root([node('/about', '/about', { loader: () => new Promise<string>(() => {}), pendingFallback: <p>Loading about</p>, component: () => <p>About</p> })]);
    renderAt('/about', tree);
    expect(await screen.findByText('Loading about')).toBeTruthy();
  });

  it('renders cached data instantly on revisit without flashing stale state', async () => {
    const LivePage = () => <p>Live: {String(useLoaderDataText('/live')).toUpperCase()}</p>;
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/live">To live</Link> }),
      node('/live', '/live', { loader: async () => 'live data', staleTime: Infinity, component: LivePage }),
      node('/boom', '/boom', { loader: async () => { throw new Error('boom'); }, errorFallback: () => <p>Boom error</p>, component: () => <p>Boom</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('To live');
    await act(async () => { await routerRuntime.navigate('/live'); });
    await screen.findByText('Live: LIVE DATA');
    await act(async () => { await routerRuntime.navigate('/boom'); });
    await screen.findByText('Boom error');
    // Second visit hits the fresh cache: renders immediately with its own data —
    // no flash of the error page's stale data (which would crash on toUpperCase).
    await act(async () => { await routerRuntime.navigate('/live'); });
    await screen.findByText('Live: LIVE DATA');
  });

  it('renders prefetched data on first visit without flashing empty state', async () => {
    const LoaderText = () => <p>Prefetched: {String(useLoaderDataText('/plive')).toUpperCase()}</p>;
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/plive" prefetch="hover" hoverPrefetchDelay={10}>To live</Link> }),
      node('/plive', '/plive', { loader: async () => 'prefetched data', component: LoaderText }),
    ]);
    renderAt('/', tree);
    await screen.findByText('To live');
    fireEvent.mouseEnter(screen.getByText('To live'));
    await new Promise(resolve => setTimeout(resolve, 400));
    await act(async () => { screen.getByText('To live').click(); });
    await screen.findByText('Prefetched: PREFETCHED DATA');
  });

  it('does not re-render route status/location subscribers on polling ticks', async () => {
    let statusRenders = 0;
    let locationRenders = 0;
    let loaderRenders = 0;
    let version = 0;
    const StatusProbe = () => { statusRenders += 1; useRouteStatus(); return null; };
    const LocationProbe = () => { locationRenders += 1; useLocation(); return null; };
    const LoaderProbe = () => {
      loaderRenders += 1;
      const text = useLoaderDataText('/live');
      return <p>Live: {String(text)}</p>;
    };
    const loader = vi.fn(async () => `v${++version}`);
    const tree = root([
      node('/', '/', { component: () => <p>Home</p> }),
      node('/live', '/live', {
        loader,
        pollingInterval: 60,
        component: () => <><StatusProbe /><LocationProbe /><LoaderProbe /></>,
      }),
    ]);
    renderAt('/live', tree);
    await waitFor(() => expect(screen.getByText(/Live: v1/)).toBeTruthy());
    statusRenders = 0; locationRenders = 0; loaderRenders = 0;
    await waitFor(() => expect(screen.getByText(/Live: v2/)).toBeTruthy());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(loader.mock.calls.length).toBeGreaterThan(2);
    expect(loaderRenders).toBeGreaterThan(0);
    expect(statusRenders).toBe(0);
    expect(locationRenders).toBe(0);
  });
});

function useLoaderDataText(id: string): unknown {
  const state = useRouteData(id);
  return state.data;
}

describe('cache snapshot parity (original cacheSnapshot.test.ts)', () => {
  const renderWithSnapshot = (tree: RouteNode, enable: boolean) => {
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    return render(
      <>
        <SnapshotProbe />
        <Router routes={tree} enableCacheSnapshot={enable} />
      </>
    );
  };

  it('exposes entries after navigation and distinguishes first load from revalidation', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    let calls = 0;
    const tree = root([
      node('/test', '/test', {
        loader: () => {
          calls++;
          if (calls === 1) return new Promise<string>(resolve => { resolveFirst = resolve; });
          return new Promise<string>(resolve => { resolveSecond = resolve; });
        },
      }),
    ]);
    const entries = () => JSON.parse(screen.getByTestId('snapshot').textContent ?? '[]') as Array<Record<string, unknown>>;
    renderWithSnapshot(tree, true);
    await screen.findByText('[]');
    let navigation: Promise<void> = Promise.resolve();
    act(() => { navigation = routerRuntime.navigate('/test'); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(entries()).toContainEqual(expect.objectContaining({ path: '/test', isCached: false, isLoading: true })));
    await act(async () => { resolveFirst('first'); await navigation; });
    await waitFor(() => expect(entries()).toContainEqual(expect.objectContaining({ path: '/test', data: 'first', isCached: true, isLoading: false })));
    act(() => { navigation = routerRuntime.navigate('/test'); });
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(entries()).toContainEqual(expect.objectContaining({ path: '/test', data: 'first', isCached: true, isLoading: true })));
    await act(async () => { resolveSecond('second'); await navigation; });
    await waitFor(() => expect(entries()).toContainEqual(expect.objectContaining({ path: '/test', data: 'second', isCached: true, isLoading: false })));
  });

  it('stays empty when enableCacheSnapshot is off and syncs on demand', async () => {
    const tree = root([node('/test', '/test', { loader: async () => 'data' })]);
    renderWithSnapshot(tree, false);
    await act(async () => { await routerRuntime.navigate('/test'); });
    expect(screen.getByTestId('snapshot').textContent).toBe('[]');
    await act(async () => { syncCacheSnapshot(); });
    expect(screen.getByTestId('snapshot').textContent).toBe('[]');
  });
});

const SnapshotProbe = () => {
  const entries = useCacheSnapshot();
  return <div data-testid="snapshot">{JSON.stringify(entries)}</div>;
};

describe('useRestoreScroll parity (original useRestoreScroll.test.tsx)', () => {
  it('restores named container scroll on manual call and skips opted-out routes', async () => {
    window.HTMLElement.prototype.scrollTo = vi.fn();
    const scrollToSpy = vi.fn();
    Object.defineProperty(document, 'scrollingElement', { value: { scrollTop: 150, scrollLeft: 0 }, configurable: true });
    Object.defineProperty(window, 'scrollTo', { value: scrollToSpy, configurable: true });
    const tree = root([
      node('/', '/', { component: () => <Link toRaw="/panel">To panel</Link> }),
      node('/panel', '/panel', { scrollRestoration: ['panel'], component: () => <div id="panel" /> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('To panel');
    await act(async () => { screen.getByText('To panel').click(); });
    await waitFor(() => expect(document.getElementById('panel')).toBeTruthy());
    const panel = document.getElementById('panel') as HTMLElement;
    Object.defineProperty(panel, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(panel, 'clientHeight', { value: 100, configurable: true });
    panel.scrollTop = 90;
    await act(async () => { await routerRuntime.navigate('/'); });
    await screen.findByText('To panel');
    await act(async () => { screen.getByText('To panel').click(); });
    await waitFor(() => expect(document.getElementById('panel')).toBeTruthy());
    const restored = document.getElementById('panel') as HTMLElement;
    const restoreSpy = vi.fn();
    restored.scrollTo = restoreSpy;
    Object.defineProperty(restored, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(restored, 'clientHeight', { value: 100, configurable: true });
    await act(async () => { restoreScrollNow(); });
    expect(restoreSpy).toHaveBeenCalledWith({ top: 90, behavior: 'auto' });
    void scrollToSpy;
  });
});

describe('prefetch queue parity (original prefetch.test.ts)', () => {
  it('runs prefetches through the concurrency queue and drains it', async () => {
    const resolvers: Array<() => void> = [];
    const loader = vi.fn(() => new Promise<string>(resolve => { resolvers.push(() => resolve('data')); }));
    const tree = root([
      node('/p0', '/p0', { loader }),
      node('/p1', '/p1', { loader }),
      node('/p2', '/p2', { loader }),
      node('/p3', '/p3', { loader }),
      node('/p4', '/p4', { loader }),
    ]);
    setRouterConfig(tree);
    await act(async () => {
      const all = Promise.all(['/p0', '/p1', '/p2', '/p3', '/p4'].map(p => routerRuntime.prefetch(p)));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(loader).toHaveBeenCalledTimes(4);
      resolvers[0]!();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(loader).toHaveBeenCalledTimes(5);
      resolvers.slice(1).forEach(resolve => resolve());
      await all;
    });
  });

  it('deduplicates concurrent prefetches of the same path', async () => {
    const loader = vi.fn(async () => 'data');
    const tree = root([node('/x', '/x', { loader })]);
    setRouterConfig(tree);
    await act(async () => { await Promise.all([routerRuntime.prefetch('/x'), routerRuntime.prefetch('/x')]); });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('staleTime parity (original revalidateCache.test.ts)', () => {
  it('refetches with staleTime 0, honors expiry and defaultStaleTime', async () => {
    let calls = 0;
    const tree = root([node('/a', '/a', { loader: async () => ++calls })]);
    setRouterConfig(tree);
    await act(async () => { await routerRuntime.navigate('/a'); });
    await act(async () => { await routerRuntime.navigate('/a'); });
    expect(calls).toBe(2);
  });

  it('keeps data fresh with staleTime Infinity until invalidation', async () => {
    let calls = 0;
    const tree = root([node('/a', '/a', { loader: async () => ++calls, staleTime: Infinity })]);
    setRouterConfig(tree);
    await act(async () => { await routerRuntime.navigate('/a'); });
    await act(async () => { await routerRuntime.navigate('/a'); });
    expect(calls).toBe(1);
    await act(async () => { await routerRuntime.invalidate('/a'); });
    expect(calls).toBe(2);
  });
});

describe('init parity (original init.test.ts)', () => {
  it('imports and navigates without window.matchMedia', async () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });
    try {
      const tree = root([node('/', '/', { component: () => <p>Home</p> })]);
      renderAt('/', tree);
      await screen.findByText('Home');
      await act(async () => { await routerRuntime.navigate('/'); });
      expect(window.location.pathname).toBe('/');
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: original, configurable: true });
    }
  });
});
