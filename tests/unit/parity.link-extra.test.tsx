import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Link, Outlet, Router, useLocation } from '../../src/index';
import { navigate, resetRouterState, setRouterConfig } from '../../src/core/actions';
import type { FileRouteOptions, LinkState, RouteNode } from '../../src/types';

const RawLink = Link as unknown as (props: any) => ReturnType<typeof Link>;

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
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
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const LinkRow = () => (
  <>
    <RawLink
      to="/about"
      data-testid="dynamic-class"
      className={({ isActive }: LinkState) => (isActive ? 'dynamic-active' : 'dynamic-inactive')}
    >
      Dynamic class
    </RawLink>
    <RawLink
      to="/about"
      data-testid="dynamic-style"
      style={({ isActive }: LinkState) => ({ color: isActive ? 'red' : 'blue', fontWeight: isActive ? 'bold' : 'normal' })}
    >
      Dynamic style
    </RawLink>
    <RawLink to="/about" data-testid="static-style" style={{ color: 'green', fontWeight: 'bold' }}>
      Static style
    </RawLink>
  </>
);

const tree = (): RouteNode => {
  const shell = ({ children }: { children: React.ReactNode }) => <><LinkRow />{children}</>;
  return node('__root__', '/', { component: () => <Outlet />, layout: shell }, [
    node('/', '/', { component: () => <h1>Home</h1> }),
    node('/about', '/about', { component: () => <p>About page</p> }),
  ]);
};

describe('Link parity: dynamic className/style flipping (original Link.test.tsx)', () => {
  it('flips the dynamic className when the link becomes active', async () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-class').className).toContain('dynamic-inactive');

    await act(async () => { await navigate('/about'); });

    const link = screen.getByTestId('dynamic-class');
    expect(link.className).toContain('dynamic-active');
    expect(link.className).not.toContain('dynamic-inactive');
  });

  it('flips the dynamic style when the link becomes active', async () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-style').style.color).toBe('blue');
    expect(screen.getByTestId('dynamic-style').style.fontWeight).toBe('normal');

    await act(async () => { await navigate('/about'); });

    expect(screen.getByTestId('dynamic-style').style.color).toBe('red');
    expect(screen.getByTestId('dynamic-style').style.fontWeight).toBe('bold');
  });

  it('applies a static style object', () => {
    renderAt('/', tree());
    const link = screen.getByTestId('static-style');
    expect(link.style.color).toBe('green');
    expect(link.style.fontWeight).toBe('bold');
  });

  it('renders children inside the anchor', () => {
    renderAt('/', tree());
    expect(screen.getByTestId('dynamic-class').textContent).toBe('Dynamic class');
  });
});

describe('Link parity: props, state and navigation guards (original Link.test.tsx)', () => {
  const navTree = (nav: ReactNode, extra: RouteNode[] = []): RouteNode => {
    const shell = ({ children }: { children: ReactNode }) => <><nav>{nav}</nav>{children}</>;
    return node('__root__', '/', { component: () => <Outlet />, layout: shell }, [
      node('/', '/', { component: () => <h1>Home</h1> }),
      node('/about', '/about', { component: () => <p>About page</p> }),
      node('/settings', '/settings', { component: () => <p>Settings page</p> }),
      node('/settings/profile', '/settings/profile', { component: () => <p>Profile page</p> }),
      node('/search', '/search', { component: () => <h1>Search page</h1> }),
      ...extra,
    ]);
  };

  it('applies a custom activeClassName instead of the default active-link', async () => {
    const tree = navTree(
      <RawLink to="/about" activeClassName="custom-active" data-testid="about">About</RawLink>
    );
    renderAt('/', tree);
    const link = await screen.findByTestId('about');
    expect(link.className).not.toContain('custom-active');
    expect(link.className).not.toContain('active-link');

    await act(async () => { await navigate('/about'); });

    expect(link.className).toContain('custom-active');
    expect(link.className).not.toContain('active-link');
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('treats non-exact links as active on nested URLs and exact links only on the exact URL', async () => {
    const tree = navTree(
      <>
        <RawLink to="/settings" data-testid="settings">Settings</RawLink>
        <RawLink to="/settings" exact data-testid="settings-exact">Settings exact</RawLink>
      </>
    );
    renderAt('/settings/profile', tree);
    await screen.findByText('Profile page');
    expect(screen.getByTestId('settings').className).toContain('active-link');
    expect(screen.getByTestId('settings-exact').className).not.toContain('active-link');

    await act(async () => { await navigate('/settings'); });
    await screen.findByText('Settings page');
    expect(screen.getByTestId('settings').className).toContain('active-link');
    expect(screen.getByTestId('settings-exact').className).toContain('active-link');
  });

  it('forwards aria-* and data-* props to the anchor and moves aria-current', async () => {
    const tree = navTree(
      <>
        <RawLink to="/" data-testid="home">Home</RawLink>
        <RawLink to="/about" aria-label="About section" aria-describedby="about-hint" data-testid="about">About</RawLink>
      </>
    );
    renderAt('/', tree);
    const home = await screen.findByTestId('home');
    const about = screen.getByTestId('about');
    expect(about.getAttribute('href')).toBe('/about');
    expect(about.getAttribute('aria-label')).toBe('About section');
    expect(about.getAttribute('aria-describedby')).toBe('about-hint');
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(about.getAttribute('aria-current')).toBeNull();

    await act(async () => { about.click(); });
    await screen.findByText('About page');
    expect(screen.getByTestId('about').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('home').getAttribute('aria-current')).toBeNull();
  });

  it('clears aria-busy after the target finishes loading', async () => {
    let resolveLoader!: (value: string) => void;
    const tree = root([
      node('/', '/', { component: () => <h1>Home</h1> }),
      node('/slow', '/slow', {
        loader: () => new Promise<string>(resolve => { resolveLoader = resolve; }),
        pendingFallback: <p>Loading slow</p>,
        component: () => <p>Slow page</p>,
      }),
    ]);
    window.history.replaceState(null, '', '/');
    setRouterConfig(tree);
    render(
      <>
        <RawLink to="/slow" data-testid="slow">Slow</RawLink>
        <Router routes={tree} />
      </>
    );
    await screen.findByText('Home');
    const link = screen.getByTestId('slow');
    expect(link.getAttribute('aria-busy')).toBeNull();

    await act(async () => { link.click(); });
    await waitFor(() => expect(link.getAttribute('aria-busy')).toBe('true'));

    await act(async () => { resolveLoader('done'); });
    await screen.findByText('Slow page');
    expect(link.getAttribute('aria-busy')).toBeNull();
  });

  it('does not prefetch when prefetch="none"', async () => {
    const loader = vi.fn(async () => 'about data');
    const tree = root([
      node('/', '/', {
        component: () => (
          <>
            <h1>Home</h1>
            <RawLink to="/about" prefetch="none" hoverPrefetchDelay={10} data-testid="about">About</RawLink>
          </>
        ),
      }),
      node('/about', '/about', { loader, component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');

    fireEvent.mouseEnter(screen.getByTestId('about'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });

    expect(loader).not.toHaveBeenCalled();
  });

  it('does not intercept modified clicks or links that open elsewhere/download', async () => {
    const tree = root([
      node('/', '/', {
        component: () => (
          <>
            <h1>Home</h1>
            <RawLink to="/about" data-testid="modified">Modified</RawLink>
            <RawLink to="/about" target="_blank" data-testid="blank">Blank</RawLink>
            <RawLink to="/about" download data-testid="download">Download</RawLink>
          </>
        ),
      }),
      node('/about', '/about', { component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByTestId('modified');

    const cases = [
      ['modified', { shiftKey: true }],
      ['modified', { altKey: true }],
      ['blank', {}],
      ['download', {}],
    ] as const;
    // Observe whether Link canceled the click before this listener does: canceling
    // in the window phase keeps jsdom from attempting a real navigation.
    const canceledByLink: boolean[] = [];
    const cancelDefault = (event: MouseEvent) => {
      canceledByLink.push(event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener('click', cancelDefault);
    try {
      for (const [testId, init] of cases) {
        const event = new MouseEvent('click', { ...init, bubbles: true, cancelable: true });
        screen.getByTestId(testId).dispatchEvent(event);
      }
    } finally {
      window.removeEventListener('click', cancelDefault);
    }

    expect(canceledByLink).toEqual(cases.map(() => false));
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('About page')).toBeNull();
  });

  it('replace rewrites the current history entry instead of pushing a new one', async () => {
    const tree = root([
      node('/', '/', {
        component: () => (
          <>
            <h1>Home</h1>
            <RawLink to="/about" replace data-testid="about">About</RawLink>
          </>
        ),
      }),
      node('/about', '/about', { component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');
    const base = window.history.length;

    await act(async () => { screen.getByTestId('about').click(); });
    await screen.findByText('About page');

    expect(window.location.pathname).toBe('/about');
    expect(window.history.length).toBe(base);
  });

  it('attaches navigation state to the history entry', async () => {
    const StateProbe = () => {
      const location = useLocation();
      return <span data-testid="location-state">{JSON.stringify(location.state ?? null)}</span>;
    };
    const tree = root([
      node('/', '/', {
        component: () => (
          <>
            <h1>Home</h1>
            <RawLink to="/about" state={{ from: 'home' }} data-testid="about">About</RawLink>
          </>
        ),
      }),
      node('/about', '/about', { component: () => <><p>About page</p><StateProbe /></> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');

    await act(async () => { screen.getByTestId('about').click(); });
    await screen.findByText('About page');

    expect(screen.getByTestId('location-state').textContent).toBe('{"from":"home"}');
  });

  it('passes isActive and isPending to the as renderer', async () => {
    let resolveLoader!: (value: string) => void;
    const shell = ({ children }: { children: ReactNode }) => (
      <>
        <RawLink
          to="/about"
          as={(props: any, state: LinkState) => (
            <button {...props} data-active={String(state.isActive)} data-pending={String(state.isPending)} />
          )}
          data-testid="as-link"
        >
          About
        </RawLink>
        {children}
      </>
    );
    const tree = node('__root__', '/', { component: () => <Outlet />, layout: shell }, [
      node('/', '/', { component: () => <h1>Home</h1> }),
      node('/about', '/about', {
        loader: () => new Promise<string>(resolve => { resolveLoader = resolve; }),
        pendingFallback: <p>Loading about</p>,
        component: () => <p>About page</p>,
      }),
    ]);
    renderAt('/', tree);
    const link = await screen.findByTestId('as-link');
    await screen.findByText('Home');
    expect(link.getAttribute('data-active')).toBe('false');
    expect(link.getAttribute('data-pending')).toBe('false');

    await act(async () => { link.click(); });
    await waitFor(() => expect(link.getAttribute('data-pending')).toBe('true'));
    expect(link.getAttribute('data-active')).toBe('true');

    await act(async () => { resolveLoader('done'); });
    await screen.findByText('About page');
    expect(link.getAttribute('data-active')).toBe('true');
    expect(link.getAttribute('data-pending')).toBe('false');
  });

  it('scopes active state to the search string when the target has one', async () => {
    const shell = ({ children }: { children: ReactNode }) => (
      <>
        <RawLink to="/search?foo=bar" data-testid="with-search">With search</RawLink>
        <RawLink to="/search" data-testid="no-search">No search</RawLink>
        {children}
      </>
    );
    const tree = node('__root__', '/', { component: () => <Outlet />, layout: shell }, [
      node('/search', '/search', { component: () => <h1>Search page</h1> }),
    ]);
    renderAt('/search?foo=bar', tree);
    await screen.findByText('Search page');
    expect(screen.getByTestId('with-search').className).toContain('active-link');

    await act(async () => { await navigate('/search'); });
    expect(screen.getByTestId('with-search').className).not.toContain('active-link');
    expect(screen.getByTestId('no-search').className).toContain('active-link');
  });

  it('waits for beforeNavigate before navigating', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const beforeNavigate = vi.fn(() => gate);
    const tree = root([
      node('/', '/', {
        component: () => (
          <>
            <h1>Home</h1>
            <RawLink to="/about" beforeNavigate={beforeNavigate} data-testid="about">About</RawLink>
          </>
        ),
      }),
      node('/about', '/about', { component: () => <p>About page</p> }),
    ]);
    renderAt('/', tree);
    await screen.findByText('Home');

    await act(async () => { screen.getByTestId('about').click(); });
    expect(beforeNavigate).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('About page')).toBeNull();

    await act(async () => { release(); });
    await screen.findByText('About page');
    expect(window.location.pathname).toBe('/about');
  });
});
