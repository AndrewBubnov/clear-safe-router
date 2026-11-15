import { describe, expect, it } from 'vitest';
import { formatSearch, interpolate, isParamSegment, isVerticalScroll, matchRoutes, matchSegments, matchesPath, sleep, splitLocation } from '../../src/runtime/match';
import type { FileRouteOptions, RouteNode } from '../../src/types';

const node = (id: string, path: string, options: FileRouteOptions<any> = {}, children: RouteNode[] = []): RouteNode => ({
  id,
  path,
  options,
  children,
}) as unknown as RouteNode;
const root = (children: RouteNode[]) => node('__root__', '/', {}, children);

describe('params extraction (original getParams)', () => {
  it('returns params for a matching route', () => {
    expect(matchSegments('/user/:userId', '/user/123', 'exact')).toEqual({ userId: '123' });
  });

  it('decodes URI-encoded params', () => {
    expect(matchSegments('/user/:userId', '/user/John%20Doe', 'exact')).toEqual({ userId: 'John Doe' });
  });

  it('returns null when the route does not match', () => {
    expect(matchSegments('/user/:userId', '/posts/123', 'exact')).toBeNull();
  });

  it('returns empty params for static matches', () => {
    expect(matchSegments('/about', '/about', 'exact')).toEqual({});
  });
});

describe('route matching (original createRouter flattening)', () => {
  it('matches a simple route', () => {
    const tree = root([node('/about', '/about')]);
    const matches = matchRoutes('/about', { pathname: '/about', search: '' }, tree);
    expect(matches.map(m => m.route.id)).toEqual(['__root__', '/about']);
  });

  it('returns no matches for unknown pathname', () => {
    const tree = root([node('/about', '/about')]);
    expect(matchRoutes('/nope', { pathname: '/nope', search: '' }, tree)).toEqual([]);
  });

  it('returns no matches without a route tree', () => {
    expect(matchRoutes('/about', { pathname: '/about', search: '' }, undefined)).toEqual([]);
  });

  it('matches nested routes and collects params at every level', () => {
    const profile = node('/user/$userId/profile', '/user/:userId/profile');
    const user = node('/user/$userId', '/user/:userId', {}, [profile]);
    const tree = root([node('/user', '/user', {}, [user])]);
    const matches = matchRoutes('/user/42/profile', { pathname: '/user/42/profile', search: '' }, tree);
    expect(matches.map(m => m.route.id)).toEqual(['__root__', '/user', '/user/$userId', '/user/$userId/profile']);
    expect(matches.at(-1)!.params).toEqual({ userId: '42' });
  });

  it('prefers static segments over dynamic ones', () => {
    const tree = root([
      node('/user/$id', '/user/:id'),
      node('/user/settings', '/user/settings'),
    ]);
    const matches = matchRoutes('/user/settings', { pathname: '/user/settings', search: '' }, tree);
    expect(matches.at(-1)!.route.id).toBe('/user/settings');
  });

  it('matches a catch-all route and exposes the splat', () => {
    const tree = root([node('/files/*', '/*')]);
    const matches = matchRoutes('/files/a/b/c', { pathname: '/files/a/b/c', search: '' }, tree);
    expect(matches.at(-1)!.route.id).toBe('/files/*');
    expect(matches.at(-1)!.params._splat).toBe('files/a/b/c');
  });

  it('matches a one-segment path with a catch-all route', () => {
    const tree = root([node('/files/*', '/*')]);
    expect(matchRoutes('/other', { pathname: '/other', search: '' }, tree).at(-1)!.params._splat).toBe('other');
  });

  it('tolerates trailing and duplicate slashes', () => {
    const tree = root([node('/user/$id/', '/user/:id/')]);
    expect(matchRoutes('/user//42', { pathname: '/user//42', search: '' }, tree).at(-1)!.params).toEqual({ id: '42' });
    expect(matchRoutes('/user/42/', { pathname: '/user/42/', search: '' }, tree).at(-1)!.params).toEqual({ id: '42' });
  });

  it('preserves route options and builds location keys on matches', () => {
    const loader = () => 'data';
    const tree = root([node('/settings', '/settings', { loader })]);
    const matches = matchRoutes('/settings', { pathname: '/settings', search: '?tab=1' }, tree);
    expect(matches.at(-1)!.route.options.loader).toBe(loader);
    expect(matches.at(-1)!.key).toBe('/settings|/settings?tab=1');
  });

  it('collects layout options along the matched chain', () => {
    const Outer = () => null;
    const Inner = () => null;
    const settings = node('/app/settings', '/app/settings', { layout: Inner });
    const tree = root([node('/app', '/app', { layout: Outer }, [settings])]);
    const matches = matchRoutes('/app/settings', { pathname: '/app/settings', search: '' }, tree);
    expect(matches.map(m => m.route.options.layout).filter(Boolean)).toEqual([Outer, Inner]);
  });
});

describe('path comparison (original comparePaths)', () => {
  it('returns true for identical paths', () => {
    expect(matchesPath('/users/123', '/users/123', true)).toBe(true);
  });

  it('returns false for different paths', () => {
    expect(matchesPath('/users/123', '/users/456', true)).toBe(false);
  });

  it('handles trailing slashes', () => {
    expect(matchesPath('/users/', '/users', true)).toBe(true);
    expect(matchesPath('/users/', '/users/123', true)).toBe(false);
  });
});

describe('pattern matching (original matchPathPattern)', () => {
  it('matches a colon param pattern', () => {
    expect(matchesPath('/user/:id', '/user/42', true)).toBe(true);
  });

  it('matches a bracket param pattern', () => {
    expect(matchesPath('/user/[id]', '/user/42', true)).toBe(true);
  });

  it('matches patterns with multiple params', () => {
    expect(matchesPath('/user/:userId/post/:postId', '/user/1/post/2', true)).toBe(true);
  });

  it('does not match sibling static segments', () => {
    expect(matchesPath('/user/:id', '/users/42', true)).toBe(false);
  });

  it('does not match different segment counts in exact mode', () => {
    expect(matchesPath('/user/:id', '/user/42/profile', true)).toBe(false);
    expect(matchesPath('/user/:id', '/user/42/profile', false)).toBe(true);
  });

  it('detects param segments', () => {
    expect(isParamSegment(':id')).toBe(true);
    expect(isParamSegment('[id]')).toBe(true);
    expect(isParamSegment('settings')).toBe(false);
  });
});

describe('formatSearch (original formatSearchObject)', () => {
  it('returns empty string for no search', () => {
    expect(formatSearch()).toBe('');
    expect(formatSearch({})).toBe('');
  });

  it('formats string, number, and boolean values', () => {
    expect(formatSearch({ q: 'test', page: 2, active: true })).toBe('?q=test&page=2&active=true');
  });

  it('skips null and undefined values', () => {
    expect(formatSearch({ a: '1', b: null, c: undefined })).toBe('?a=1');
  });

  it('normalizes an existing search string', () => {
    expect(formatSearch('?a=1&b=2')).toBe('?a=1&b=2');
    expect(formatSearch('')).toBe('');
  });
});

describe('splitLocation (original parseWindowLocation)', () => {
  it('splits pathname and search', () => {
    expect(splitLocation('/users?tab=1')).toEqual({ pathname: '/users', search: '?tab=1' });
    expect(splitLocation('/users')).toEqual({ pathname: '/users', search: '' });
  });
});

describe('interpolate (original interpolatePath)', () => {
  it('interpolates a single param', () => {
    expect(interpolate('/user/$id', { id: '123' })).toBe('/user/123');
  });

  it('interpolates multiple params', () => {
    expect(interpolate('/$lang/docs/$page', { lang: 'en', page: 'intro' })).toBe('/en/docs/intro');
  });

  it('returns the path untouched when params are not provided', () => {
    expect(interpolate('/user/$id')).toBe('/user/$id');
  });

  it('encodes interpolated values', () => {
    expect(interpolate('/user/$name', { name: 'John Doe' })).toBe('/user/John%20Doe');
  });

  it('coerces numeric params to strings', () => {
    expect(interpolate('/user/$id', { id: 123 })).toBe('/user/123');
  });

  it('ignores extra params', () => {
    expect(interpolate('/user/$id', { id: '1', other: 'x' })).toBe('/user/1');
  });

  it('throws when a required param is missing', () => {
    expect(() => interpolate('/user/$id', {})).toThrow('Missing route parameter "id" for "/user/$id"');
  });
});

describe('scroll helpers (original isVerticalScroll)', () => {
  const fakeElement = (props: { scrollHeight: number; clientHeight: number }) => props as unknown as Element;

  it('returns true for vertically overflowing elements', () => {
    expect(isVerticalScroll(fakeElement({ scrollHeight: 500, clientHeight: 200 }))).toBe(true);
  });

  it('returns false for non-scrollable elements', () => {
    expect(isVerticalScroll(fakeElement({ scrollHeight: 200, clientHeight: 200 }))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isVerticalScroll(null)).toBe(false);
  });
});

describe('sleep (original utils.test.ts)', () => {
  it('resolves after the given delay', async () => {
    const start = Date.now();
    await sleep(40);
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });
});
