import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { FileRouteOptions, RouteNode } from '../../src/types';
import {
  getRoute,
  Link,
  Outlet,
  Router,
  useInvalidate,
  useLocation,
  useNavigate,
  useRouteStatus,
  useRouterContext,
  useSearchParams,
} from '../../src/index';
import { configureRouter, invalidate, resetRouterState, setRouterConfig } from '../../src/runtime';

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
const root = (children: RouteNode[]) => node('__root__', '/', { component: () => <Outlet /> }, children);

// Synthetic runtime tree routes don't exist in the generated RouteId union â€”
// bypass Link's compile-time checking to keep runtime parity.
const RawLink = Link as unknown as (props: {
  to: string;
  params?: Record<string, string | number>;
  search?: string | Record<string, string | number | boolean | null | undefined>;
  exact?: boolean;
  pendingClassName?: string;
  hoverPrefetchDelay?: number;
  as?: (props: any, state: { isActive: boolean; isPending: boolean }) => ReactElement;
  children?: ReactNode;
} & Record<`data-${string}`, string>) => ReturnType<typeof Link>;

const renderAt = (path: string, tree: RouteNode) => {
  window.history.replaceState(null, '', path);
  setRouterConfig(tree);
  return render(<Router routes={tree} />);
};

afterEach(() => {
  cleanup();
  resetRouterState();
  configureRouter({ defaultPrefetch: 'hover' });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Link parity additions (original Link.test.tsx)', () => {
  it('does not navigate when the click default is prevented', () => {
    const tree = root([
      node('/', '/', {
        component: () => (
          <div>
            <p>Home</p>
            <RawLink to="/about" data-testid="about">About</RawLink>
          </div>
        ),
      }),
      node('/about', '/about', { component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    const link = screen.getByTestId('about');
    link.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { capture: true, once: true });
    link.click();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('About page')).toBeNull();
  });

  it('marks only the link whose search matches the pending location', async () => {
    let resolveLoader!: (value: string) => void;
    const tree = root([
      node('/', '/', { component: () => <p>Pending home</p> }),
      node('/search', '/search', {
        loader: () => new Promise<string>(resolve => { resolveLoader = resolve; }),
        component: () => <p>Search page</p>,
      }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(
      <>
        <RawLink to="/search" data-testid="no-search">No search</RawLink>
        <RawLink to="/search" search={{ q: 'x' }} data-testid="with-search" pendingClassName="my-pending">With search</RawLink>
        <RawLink to="/search" search={{ q: 'x' }} data-testid="with-search-default">With search default</RawLink>
        <Router routes={tree} />
      </>
    );
    await screen.findByText('Pending home');
    const noSearch = screen.getByTestId('no-search');
    const withSearch = screen.getByTestId('with-search');
    const withSearchDefault = screen.getByTestId('with-search-default');
    await act(async () => { withSearch.click(); });
    await waitFor(() => expect(withSearch.className).toContain('my-pending'));
    expect(withSearchDefault.className).toContain('pending-link');
    expect(noSearch.className).not.toContain('pending-link');
    await act(async () => { resolveLoader('data'); });
    await screen.findByText('Search page');
  });

  it('builds href and navigates from a path template and params', async () => {
    const tree = root([
      node('/', '/', {
        component: () => (
          <div>
            <p>Path home</p>
            <RawLink to="/user/$id" params={{ id: '42' }} data-testid="to-user">To user</RawLink>
          </div>
        ),
      }),
      node('/user/$id', '/user/:id', { component: () => <ParamsDisplay /> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Path home');
    const link = screen.getByTestId('to-user');
    expect(link.getAttribute('href')).toBe('/user/42');
    await act(async () => { link.click(); });
    await waitFor(() => expect(screen.getByTestId('params').textContent).toBe('{"id":"42"}'));
  });

  it('uses the prefetch strategy current at hover time', async () => {
    const loader = vi.fn(async () => 'about data');
    const tree = root([
      node('/', '/', {
        component: () => (
          <div>
            <p>Hover home</p>
            <RawLink to="/about" hoverPrefetchDelay={10} data-testid="about-hover">About hover</RawLink>
          </div>
        ),
      }),
      node('/about', '/about', { loader, component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Hover home');
    vi.useFakeTimers();
    configureRouter({ defaultPrefetch: 'none' });
    fireEvent.mouseEnter(screen.getByTestId('about-hover'));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(loader).not.toHaveBeenCalled();
    configureRouter({ defaultPrefetch: 'hover' });
    fireEvent.mouseEnter(screen.getByTestId('about-hover'));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

// The parity trees use route IDs that are not in the playground route map,
// so the id side of getRoute is widened for these probes.
const hookRoute = (id: string) => getRoute(id as never) as unknown as ReturnType<typeof getRoute<'/playground/live'>>;

const ParamsDisplay = () => {
  const params = hookRoute('/user/$id').useParams();
  return <span data-testid="params">{JSON.stringify(params)}</span>;
};
const HookProbe = ({ hook }: { hook: () => unknown }) => (
  <span data-testid="hook-value">{JSON.stringify(hook(), (_key, value) => (typeof value === 'function' ? '[Function]' : value))}</span>
);
const hookTree = (hook: () => unknown) => root([
  node('/', '/', { loader: async () => 'home data', component: () => <HookProbe hook={hook} /> }),
  node('/about', '/about', { loader: async () => 'about data', component: () => <HookProbe hook={hook} /> }),
  node('/user/$id', '/user/:id', { component: () => <HookProbe hook={hook} /> }),
  node('/test', '/test', { loader: async () => 'cached data', component: () => <HookProbe hook={hook} /> }),
]);
const renderHookAt = async (hook: () => unknown, path = '/') => {
  renderAt(path, hookTree(hook));
  await waitFor(() => expect(screen.getByTestId('hook-value').textContent).not.toBe(''));
};

describe('hooks parity (original Link.test.tsx)', () => {
  it('useParams returns an empty object on the root path', async () => {
    await renderHookAt(() => hookRoute('/user/$id').useParams());
    expect(screen.getByTestId('hook-value').textContent).toBe('{}');
  });

  it('useParams returns route params', async () => {
    await renderHookAt(() => hookRoute('/user/$id').useParams(), '/user/42');
    expect(screen.getByTestId('hook-value').textContent).toBe('{"id":"42"}');
  });

  it('useLocation returns the current pathname and search', async () => {
    await renderHookAt(() => useLocation().pathname);
    expect(screen.getByTestId('hook-value').textContent).toBe('"/"');
    cleanup();
    await renderHookAt(() => useLocation().search, '/about?q=test');
    expect(screen.getByTestId('hook-value').textContent).toBe('"?q=test"');
  });

  it('useNavigate returns a function', async () => {
    await renderHookAt(() => typeof useNavigate());
    expect(screen.getByTestId('hook-value').textContent).toBe('"function"');
  });

  it('useLoaderState returns loader data after loading', async () => {
    await renderHookAt(() => hookRoute('/').useLoaderData<string>());
    expect(screen.getByTestId('hook-value').textContent).toBe('"home data"');
  });

  it('useSearchParams exposes parsed params and getSearchParams', async () => {
    await renderHookAt(() => Object.fromEntries(useSearchParams().searchParams.entries()), '/about?foo=bar&baz=qux');
    expect(screen.getByTestId('hook-value').textContent).toBe('{"foo":"bar","baz":"qux"}');
    cleanup();
    await renderHookAt(() => useSearchParams().getSearchParams('foo'), '/about?foo=bar');
    expect(screen.getByTestId('hook-value').textContent).toBe('"bar"');
    cleanup();
    await renderHookAt(() => useSearchParams().getSearchParams('missing'), '/about?foo=bar');
    // Deliberate API extension: absent keys yield null (and repeated keys an array)
    // instead of the original's '' placeholder.
    expect(screen.getByTestId('hook-value').textContent).toBe('null');
  });

  it('useSearchParams returns stable identities across re-renders with the same search', async () => {
    const identities: ReturnType<typeof useSearchParams>[] = [];
    const Probe = () => {
      identities.push(useSearchParams());
      return null;
    };
    renderAt('/about?foo=bar', hookTree(() => { Probe(); return null; }));
    await waitFor(() => expect(identities.length).toBeGreaterThan(0));
    const initial = identities[identities.length - 1]!;
    await act(async () => { initial.setSearchParams('foo', 'baz'); });
    const afterUpdate = identities[identities.length - 1]!;
    // The setter stays stable across search changes for memoized consumers;
    // the parsed params refresh with the URL.
    expect(afterUpdate.setSearchParams).toBe(initial.setSearchParams);
    expect(afterUpdate.searchParams).not.toBe(initial.searchParams);
    expect(afterUpdate.searchParams.get('foo')).toBe('baz');
  });

  it('staleOnly invalidate finds a search-shallow-updated URL (the copied cache entry is stale, not missing)', async () => {
    const loader = vi.fn(async ({ search }: any) => `page:${search.page ?? '1'}`);
    const tree = root([node('/list', '/list', { loader, staleTime: Infinity, component: () => <p>List</p> })]);
    renderAt('/list', tree);
    await screen.findByText('List');
    expect(loader).toHaveBeenCalledTimes(1);
    const { updateSearchParams } = await import('../../src/core/actions');
    await act(async () => { updateSearchParams('page', '2'); });
    const { cache } = await import('../../src/core/state');
    const newKey = cache.keys().next().value as string;
    expect(newKey).toContain('page=2');
    // The carried value is deliberately stale: only a loader run re-freshens it.
    expect(cache.get(newKey)!.staleTime).toBe(0);
    expect(window.location.search).toBe('?page=2');
    // A staleOnly revalidation now finds the entry and re-runs the loader with
    // the new search — previously the missing cache entry made it skip forever.
    loader.mockClear();
    await act(async () => { await invalidate(undefined, { staleOnly: true }); });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]?.[0]).toMatchObject({ search: { page: '2' } });
  });

  it('setSearchParams updates the URL for strings and functions', async () => {
    const SetComponent = () => {
      const { setSearchParams } = useSearchParams();
      return (
        <div>
          <button data-testid="set-string" onClick={() => setSearchParams('color', 'red')}>Set</button>
          <button data-testid="set-fn" onClick={() => setSearchParams(prev => { prev.set('page', '3'); return prev; })}>Set fn</button>
        </div>
      );
    };
    renderAt('/test', root([node('/test', '/test', { loader: async () => 'cached data', component: () => <SetComponent /> })]));
    await waitFor(() => expect(screen.getByTestId('set-string')).toBeTruthy());
    await act(async () => { screen.getByTestId('set-string').click(); });
    expect(window.location.search).toBe('?color=red');
    await act(async () => { screen.getByTestId('set-fn').click(); });
    expect(window.location.search).toContain('page=3');
    expect(window.location.search).toContain('color=red');
  });

  it('setSearchParams does not rerun the route loader', async () => {
    const loader = vi.fn().mockResolvedValue('cached data');
    const SearchPage = () => {
      const { getSearchParams, setSearchParams } = useSearchParams();
      const data = hookRoute('/test').useLoaderData<string>();
      return (
        <div>
          <span data-testid="loader-data">{String(data)}</span>
          <span data-testid="brand">{getSearchParams('brand')}</span>
          <button data-testid="set-brand" onClick={() => setSearchParams('brand', 'nike')}>Set brand</button>
        </div>
      );
    };
    renderAt('/test', root([node('/test', '/test', { loader, component: () => <SearchPage /> })]));
    await waitFor(() => expect(screen.getByTestId('loader-data').textContent).toBe('cached data'));
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () => { screen.getByTestId('set-brand').click(); });
    expect(window.location.search).toBe('?brand=nike');
    expect(screen.getByTestId('brand').textContent).toBe('nike');
    expect(screen.getByTestId('loader-data').textContent).toBe('cached data');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidate after setSearchParams reruns the loader with the new search', async () => {
    const brands: string[] = [];
    const loader = vi.fn(async ({ search }: any) => {
      const brand = search.brand ?? '';
      brands.push(brand);
      return brand ? `brand:${brand}` : 'no brand';
    });
    const SearchPage = () => {
      const { setSearchParams } = useSearchParams();
      const invalidate = useInvalidate();
      const data = hookRoute('/test').useLoaderData<string>();
      return (
        <div>
          <span data-testid="loader-data">{String(data)}</span>
          <button
            data-testid="apply-brand"
            onClick={async () => {
              setSearchParams('brand', 'nike');
              await invalidate();
            }}
          >
            Apply brand
          </button>
        </div>
      );
    };
    renderAt('/test', root([node('/test', '/test', { loader, component: () => <SearchPage /> })]));
    await waitFor(() => expect(screen.getByTestId('loader-data').textContent).toBe('no brand'));
    await act(async () => { screen.getByTestId('apply-brand').click(); });
    expect(window.location.search).toBe('?brand=nike');
    await waitFor(() => expect(screen.getByTestId('loader-data').textContent).toBe('brand:nike'));
    expect(new Set(brands)).toEqual(new Set(['', 'nike']));
  });

  it('useRouterContext returns context and setContext updates it', async () => {
    await renderHookAt(() => {
      const { context, setContext } = useRouterContext();
      return { hasContext: typeof context === 'object', hasSetContext: typeof setContext === 'function' };
    });
    expect(screen.getByTestId('hook-value').textContent).toBe('{"hasContext":true,"hasSetContext":true}');

    cleanup();
    const ContextUpdater = () => {
      const { context, setContext } = useRouterContext();
      return (
        <div>
          <span data-testid="context-value">{String(context.custom)}</span>
          <button data-testid="update-context" onClick={() => setContext(previous => ({ ...previous, custom: 'updated' }))}>Update</button>
        </div>
      );
    };
    renderAt('/', root([node('/', '/', { component: () => <ContextUpdater /> })]));
    await waitFor(() => expect(screen.getByTestId('context-value').textContent).toBe('undefined'));
    await act(async () => { screen.getByTestId('update-context').click(); });
    expect(screen.getByTestId('context-value').textContent).toBe('updated');
  });

  it('useRouteStatus becomes false after loading completes', async () => {
    await renderHookAt(() => useRouteStatus(status => status === 'pending'));
    expect(screen.getByTestId('hook-value').textContent).toBe('false');
  });

  it('useRouteStatus is true while an optimistic revalidation runs', async () => {
    let resolveLoader!: (value: string) => void;
    const tree = root([
      node('/', '/', { component: () => <p>Loading home</p> }),
      node('/opt', '/opt', {
        loader: () => new Promise<string>(resolve => { resolveLoader = resolve; }),
        staleTime: 0,
        optimistic: true,
        component: () => <p>Opt page</p>,
      }),
    ]);
    const Probe = () => {
      const loading = useRouteStatus(status => status === 'pending' || status === 'optimistic');
      const navigate = useNavigate();
      return (
        <div>
          <button data-testid="go-opt" onClick={() => { void navigate('/opt'); }}>{loading ? 'yes' : 'no'}</button>
          <button data-testid="go-home" onClick={() => { void navigate('/'); }}>home</button>
        </div>
      );
    };
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(
      <>
        <Probe />
        <Router routes={tree} />
      </>
    );
    await screen.findByText('Loading home');
    expect(screen.getByTestId('go-opt').textContent).toBe('no');
    await act(async () => { screen.getByTestId('go-opt').click(); });
    await waitFor(() => expect(resolveLoader).toBeDefined());
    await act(async () => { resolveLoader('v1'); });
    await screen.findByText('Opt page');
    expect(screen.getByTestId('go-opt').textContent).toBe('no');
    await act(async () => { screen.getByTestId('go-home').click(); });
    await screen.findByText('Loading home');
    await act(async () => { screen.getByTestId('go-opt').click(); });
    await waitFor(() => expect(screen.getByTestId('go-opt').textContent).toBe('yes'));
    await act(async () => { resolveLoader('v2'); });
    await waitFor(() => expect(screen.getByTestId('go-opt').textContent).toBe('no'));
  });

  it('useInvalidate returns a function', async () => {
    await renderHookAt(() => typeof useInvalidate());
    expect(screen.getByTestId('hook-value').textContent).toBe('"function"');
  });

  it('re-renders only links whose active state flips', async () => {
    const renderCounts: Record<string, number> = {};
    const CountingAnchor = (props: any) => {
      renderCounts[props.href] = (renderCounts[props.href] ?? 0) + 1;
      return <a {...props} />;
    };
    const tree = root([
      node('/rc-a', '/rc-a', { component: () => <p>Page A</p> }),
      node('/rc-b', '/rc-b', { loader: async () => 'b data', component: () => <p>Page B</p> }),
      node('/rc-c', '/rc-c', { component: () => <p>Page C</p> }),
    ]);
    window.history.replaceState(null, '', '/rc-a');
    setRouterConfig(tree);
    render(
      <>
        <RawLink to="/rc-a" as={CountingAnchor}>A</RawLink>
        <RawLink to="/rc-b" as={CountingAnchor}>B</RawLink>
        <RawLink to="/rc-c" as={CountingAnchor}>C</RawLink>
        <Router routes={tree} />
      </>
    );
    await screen.findByText('Page A');
    for (const key of Object.keys(renderCounts)) renderCounts[key] = 0;
    await act(async () => { screen.getByText('B').click(); });
    await screen.findByText('Page B');
    expect(renderCounts['/rc-a']).toBeGreaterThan(0);
    expect(renderCounts['/rc-b']).toBeGreaterThan(0);
    expect(renderCounts['/rc-c']).toBe(0);
  });
});

