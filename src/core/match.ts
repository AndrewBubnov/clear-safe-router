import type { RouteMatch, RouteNode, RouterLocation } from './types';

const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed %-encoding in the URL — treat the segment as unmatched.
    return null;
  }
};

export const normalizeSearch = (search: string) => search && !search.startsWith('?') ? `?${search}` : search;
/** Canonical search for cache keys only (the URL itself is left as authored):
 * name-then-value stable sort so `?tag=a&tag=b` and `?tag=b&tag=a` share one
 * cache entry, empty search collapses to ''. */
export const canonicalSearch = (search: string) => {
  if (!search || search === '?') return '';
  const entries = [...new URLSearchParams(search).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en') || a[1].localeCompare(b[1], 'en'));
  const query = new URLSearchParams();
  entries.forEach(([key, value]) => query.append(key, value));
  return `?${query.toString()}`;
};
export const splitPath = (value: string) => value.split('/').filter(Boolean);
export const splitLocation = (value: string) => {
  const index = value.indexOf('?');
  return index === -1 ? { pathname: value, search: '' } : { pathname: value.slice(0, index), search: value.slice(index) };
};
export const matchSegments = (pattern: string, pathname: string, mode: 'exact' | 'prefix' | 'wildcard'): Record<string, string> | null => {
  const expected = splitPath(pattern.endsWith('*') ? pattern.slice(0, -1) : pattern);
  const actual = splitPath(pathname);
  if (mode === 'exact' ? actual.length !== expected.length : actual.length < expected.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i]!;
    const value = actual[i]!;
    if (part.startsWith(':')) {
      const decoded = decodeSegment(value);
      if (decoded === null) return null;
      params[part.slice(1)] = decoded;
    } else if (part !== value) return null;
  }
  if (mode === 'wildcard') {
    const decodedSplat = actual.slice(expected.length).map(decodeSegment);
    if (decodedSplat.some(part => part === null)) return null;
    params._splat = decodedSplat.join('/');
  }
  return params;
};
export const flatten = (root: RouteNode) => {
  const result: { route: RouteNode; depth: number; parent?: RouteNode }[] = [];
  const parents = new Map<RouteNode, RouteNode>();
  const visit = (route: RouteNode, depth: number, parent?: RouteNode) => {
    result.push({ route, depth, parent });
    if (parent) parents.set(route, parent);
    route.children.forEach(child => visit(child, depth + 1, route));
  };
  visit(root, 0);
  return { routes: result, parents };
};
const specificity = (path: string) => splitPath(path).map(segment => segment.startsWith(':') ? 0 : 1);
const compareSpecificity = (a: number[], b: number[]) => {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? -1;
    const right = b[i] ?? -1;
    if (left !== right) return right - left;
  }
  return 0;
};
export const matchRoutes = (pathname: string, location: RouterLocation, routes: RouteNode | undefined): RouteMatch[] => {
  if (!routes) return [];
  const { routes: all, parents } = flatten(routes);
  const candidates = all.flatMap(({ route, depth }) => {
    const wild = route.path.endsWith('*');
    const params = matchSegments(route.path, pathname, wild ? 'wildcard' : 'exact');
    return params ? [{ route, depth, params, wild }] : [];
  }).sort((a, b) => Number(a.wild) - Number(b.wild)
    || compareSpecificity(specificity(a.route.path), specificity(b.route.path))
    || b.depth - a.depth
    || Number(b.route.id.endsWith('/')) - Number(a.route.id.endsWith('/'))
    || b.route.path.length - a.route.path.length
    || a.route.id.localeCompare(b.route.id, 'en'));
  const leaf = candidates[0];
  if (!leaf) return [];
  const path: RouteNode[] = [];
  let current: RouteNode | undefined = leaf.route;
  while (current) {
    path.unshift(current);
    current = parents.get(current);
  }
  return path.map(route => {
    const params = route === leaf.route ? leaf.params : matchSegments(route.path, pathname, 'prefix') ?? {};
    return { route, params, key: `${route.id}|${location.pathname}${location.search}` };
  });
};
export const formatSearch = (search?: string | Record<string, string | number | boolean | null | undefined>) => {
  if (typeof search === 'string') return normalizeSearch(search);
  if (!search) return '';
  const query = new URLSearchParams();
  Object.entries(search).forEach(([key, value]) => { if (value !== undefined && value !== null) query.set(key, String(value)); });
  const text = query.toString();
  return text ? `?${text}` : '';
};
export const interpolate = (to: string, params?: Record<string, string | number>) => {
  if (!params) return to;
  // `$name` is a named segment; a bare `$` is the catch-all segment (`_splat`).
  // The splat keeps its slashes — only individual segments are encoded.
  return to.replace(/\$([A-Za-z][A-Za-z0-9_]*)?(?![A-Za-z0-9_])/g, (_full, key: string | undefined) => {
    const name = key ?? "_splat";
    const value = params[name];
    if (value === undefined) throw new Error(`Missing route parameter "${name}" for "${to}"`);
    const encoded = encodeURIComponent(String(value));
    return name === "_splat" ? encoded.replace(/%2F/g, "/") : encoded;
  });
};
export const resolveTarget = (target: { to?: string; toRaw?: string; params?: Record<string, string | number>; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown }) => {
  const split = splitLocation(target.toRaw ?? interpolate(target.to ?? '/', target.params));
  return { pathname: split.pathname, search: target.search !== undefined ? formatSearch(target.search) : split.search, state: target.state };
};
export const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
export const isSameLocation = (a: RouterLocation, b: RouterLocation) => a.pathname === b.pathname && a.search === b.search;
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const isVerticalScroll = (element: { scrollHeight: number; clientHeight: number } | null) => !!element && element.scrollHeight > element.clientHeight;
export const parseCacheKey = (key: string) => { const separator = key.indexOf('|'); return { id: key.slice(0, separator), url: key.slice(separator + 1) }; };
export const splitUrl = (url: string) => { const index = url.indexOf('?'); return index === -1 ? { pathname: url, search: '' } : { pathname: url.slice(0, index), search: url.slice(index) }; };
export const isParamSegment = (part: string) => part.startsWith(':') || part.startsWith('$') || /^\[[^\]]+\]$/.test(part);
export const matchesPath = (pattern: string, pathname: string, exact: boolean) => {
  const expected = splitPath(pattern);
  const actual = splitPath(pathname);
  if (exact ? actual.length !== expected.length : actual.length < expected.length) return false;
  return expected.every((part, index) => isParamSegment(part) || part === actual[index]);
};
