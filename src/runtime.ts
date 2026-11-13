import { useSyncExternalStore } from 'react';
import type { RouteMatch, RouteNode, RouterLocation, RouterSnapshot, RouterRuntime } from './types';

type CacheEntry = { value: unknown; updatedAt: number; staleTime: number; gcTime?: number; lastUsed: number; reason?: 'navigation' | 'prefetch' | 'invalidate' | 'polling'; prefetchedUntil?: number; timer?: ReturnType<typeof setTimeout> };
type Flight = { controller: AbortController; signal: AbortSignal; token: object; promise: Promise<unknown> };
type Blocker = (args: { current: RouterLocation; next: RouterLocation }) => boolean;
const listeners = new Set<() => void>();
const cache = new Map<string, CacheEntry>();
const flights = new Map<string, Flight>();
const routeErrors = new Map<string, Error>();
let routes: RouteNode | undefined;
let maxCacheSize = 100;
let context: Record<string, unknown> = {};
let blocker: Blocker | undefined;
let blockedTarget: RouterLocation | undefined;
let bypassBlockerOnce = false;
let suppressPopstate = false;
let savedScroll = new Map<string, { x: number; y: number }>();
let navigateImpl: (target: RouterLocation, options?: { replace?: boolean; fromPop?: boolean }) => Promise<void>;
let navigationSeq = 0;
let activeController: AbortController | undefined;
const initialLocation = (): RouterLocation => ({ pathname: window.location.pathname, search: window.location.search, state: window.history.state });
let snapshot: RouterSnapshot = { location: initialLocation(), status: 'idle', matches: [], data: new Map(), errors: routeErrors };
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot;
export const useRouterSnapshot = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
const routeKey = (route: RouteNode, location: RouterLocation) => `${route.id}|${location.pathname}${location.search}`;
const normalizeSearch = (search: string) => search && !search.startsWith('?') ? `?${search}` : search;
const splitPath = (value: string) => value.split('/').filter(Boolean);
const matchSegments = (pattern: string, pathname: string, mode: 'exact' | 'prefix' | 'wildcard'): Record<string, string> | null => {
  const expected = splitPath(pattern.endsWith('*') ? pattern.slice(0, -1) : pattern);
  const actual = splitPath(pathname);
  if (mode === 'exact' ? actual.length !== expected.length : actual.length < expected.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i]!;
    const value = actual[i]!;
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  if (mode === 'wildcard') params._splat = actual.slice(expected.length).map(decodeURIComponent).join('/');
  return params;
};
const flatten = (root: RouteNode) => {
  const result: { route: RouteNode; depth: number; parent?: RouteNode }[] = [];
  const visit = (route: RouteNode, depth: number, parent?: RouteNode) => {
    result.push({ route, depth, parent });
    route.children.forEach(child => visit(child, depth + 1, route));
  };
  visit(root, 0);
  return result;
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
const matchRoutes = (pathname: string, location: RouterLocation): RouteMatch[] => {
  if (!routes) return [];
  const all = flatten(routes);
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
    current = all.find(item => item.route === current)?.parent;
  }
  return path.map(route => {
    const params = route === leaf.route ? leaf.params : matchSegments(route.path, pathname, 'prefix') ?? {};
    return { route, params, key: routeKey(route, location) };
  });
};
const formatSearch = (search?: string | Record<string, string | number | boolean | null | undefined>) => {
  if (typeof search === 'string') return normalizeSearch(search);
  if (!search) return '';
  const query = new URLSearchParams();
  Object.entries(search).forEach(([key, value]) => { if (value !== undefined && value !== null) query.set(key, String(value)); });
  const text = query.toString();
  return text ? `?${text}` : '';
};
const interpolate = (to: string, params?: Record<string, string | number>) => {
  if (!params) return to;
  return to.replace(/\$([A-Za-z][A-Za-z0-9_]*)/g, (_full, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing route parameter "${key}" for "${to}"`);
    return encodeURIComponent(String(value));
  });
};
export const resolveTarget = (target: { to?: string; toRaw?: string; params?: Record<string, string | number>; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown }) => {
  const split = splitLocation(target.toRaw ?? interpolate(target.to ?? '/', target.params));
  return { pathname: split.pathname, search: target.search !== undefined ? formatSearch(target.search) : split.search, state: target.state };
};
const isFresh = (entry?: CacheEntry) => !!entry && (Date.now() - entry.updatedAt < entry.staleTime || (entry.reason === 'prefetch' && (entry.prefetchedUntil ?? 0) > Date.now()));
const touch = (key: string, entry: CacheEntry) => { cache.delete(key); entry.lastUsed = Date.now(); cache.set(key, entry); };
const evict = () => {
  while (cache.size > maxCacheSize) {
    const currentPrefix = `${snapshot.location.pathname}${snapshot.location.search}`;
    const oldest = [...cache.keys()].find(key => !key.endsWith(`|${currentPrefix}`)) ?? cache.keys().next().value;
    if (!oldest) break;
    const entry = cache.get(oldest);
    if (entry?.timer) clearTimeout(entry.timer);
    cache.delete(oldest);
  }
};
const runLoader = (match: RouteMatch, location: RouterLocation, signal: AbortSignal, force = false, reason: CacheEntry['reason'] = 'navigation'): Promise<unknown> => {
  const loader = match.route.options.loader;
  if (!loader) return Promise.resolve(undefined);
  const key = routeKey(match.route, location);
  const existing = flights.get(key);
  if (existing && !existing.signal.aborted) {
    if (signal === activeController?.signal && existing.signal !== signal) { existing.controller.abort(); flights.delete(key); }
    else return existing.promise;
  }
  if (existing?.signal.aborted) { existing.controller.abort(); flights.delete(key); }
  const cached = cache.get(key);
  if (cached?.timer) { clearTimeout(cached.timer); cached.timer = undefined; }
  if (!force && isFresh(cached)) {
    if (reason === 'navigation' && cached?.reason === 'prefetch') { cached.reason = 'navigation'; cached.staleTime = match.route.options.staleTime ?? 0; cached.prefetchedUntil = undefined; }
    touch(key, cached!); return Promise.resolve(cached!.value);
  }
  const token = {};
  let attempts = 0;
  const work = async (requestSignal: AbortSignal): Promise<unknown> => {
    attempts++;
    try {
      const value = await loader({ params: match.params, search: Object.fromEntries(new URLSearchParams(location.search)), context, signal: requestSignal, attempt: attempts, location });
      if (requestSignal.aborted || flights.get(key)?.token !== token) return undefined;
      const previous = cache.get(key);
      if (previous?.timer) clearTimeout(previous.timer);
      const staleTime = match.route.options.staleTime ?? 0;
      const entry: CacheEntry = { value, updatedAt: Date.now(), staleTime: reason === 'prefetch' ? Math.max(staleTime, 30_000) : staleTime, reason, prefetchedUntil: reason === 'prefetch' ? Date.now() + Math.max(0, 30_000 - staleTime) : undefined, gcTime: match.route.options.gcTime, lastUsed: Date.now() };
      cache.set(key, entry);
      evict();
      return value;
    } catch (error) {
      if (requestSignal.aborted || flights.get(key)?.token !== token) return undefined;
      const retry = match.route.options.retry;
      const count = typeof retry === 'number' ? retry : retry?.count ?? 0;
      const delay = typeof retry === 'number' ? 0 : retry?.delay ?? 0;
      if (attempts <= count) { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); if (!requestSignal.aborted) return work(requestSignal); }
      throw error;
    }
  };
  const flight: Flight = { controller: new AbortController(), signal, token, promise: Promise.resolve() };
  // The caller's signal owns the flight; signal checks also protect loaders that ignore abort.
  const onAbort = () => flight.controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const onFlightAbort = () => { if (flights.get(key)?.token === token) flights.delete(key); };
  flight.controller.signal.addEventListener('abort', onFlightAbort, { once: true });
  flights.set(key, flight);
  flight.promise = work(flight.controller.signal).finally(() => {
    signal.removeEventListener('abort', onAbort);
    flight.controller.signal.removeEventListener('abort', onFlightAbort);
    if (flights.get(key)?.token === token) flights.delete(key);
  });
  return flight.promise;
};
const commit = (next: RouterSnapshot, replace = false, fromPop = false) => {
  const url = `${next.location.pathname}${next.location.search}`;
  if (fromPop) {
    if (url !== `${window.location.pathname}${window.location.search}`) history.replaceState(next.location.state ?? null, '', url);
  } else if (replace) history.replaceState(next.location.state ?? null, '', url);
  else if (url !== `${window.location.pathname}${window.location.search}`) history.pushState(next.location.state ?? null, '', url);
  snapshot = next;
  emit();
};
const splitLocation = (value: string) => {
  const index = value.indexOf('?');
  return index === -1 ? { pathname: value, search: '' } : { pathname: value.slice(0, index), search: value.slice(index) };
};
const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
const isSameLocation = (a: RouterLocation, b: RouterLocation) => a.pathname === b.pathname && a.search === b.search;
const loadLocation = async (location: RouterLocation, options: { replace?: boolean; fromPop?: boolean } = {}) => {
  if (!options.fromPop && snapshot.matches.at(-1)?.route.options.scrollRestoration) savedScroll.set(`${snapshot.location.pathname}${snapshot.location.search}`, { x: window.scrollX, y: window.scrollY });
  if (bypassBlockerOnce) bypassBlockerOnce = false;
  else if (blocker?.({ current: snapshot.location, next: location })) { blockedTarget = location; emit(); return; }
  const seq = ++navigationSeq;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const matches = matchRoutes(location.pathname, location);
  const data = new Map<string, unknown>();
  const errors = new Map<string, Error>();
  let needsLoading = false;
  let optimistic = false;
  for (const match of matches) {
    const entry = cache.get(routeKey(match.route, location));
    if (entry && (isFresh(entry) || match.route.options.optimistic)) data.set(routeKey(match.route, location), entry.value);
    if (entry && match.route.options.optimistic) optimistic = true;
    if (match.route.options.loader && !isFresh(entry)) needsLoading = true;
  }
  snapshot = { ...snapshot, location, status: optimistic ? 'optimistic' : needsLoading ? 'pending' : 'active', matches, data, errors };
  emit();
  try {
    const revalidated: RouteMatch[] = [];
    for (const match of matches) {
      if (seq !== navigationSeq || controller.signal.aborted) return;
      const beforeLoad = match.route.options.beforeLoad;
      if (beforeLoad) {
        let redirected: RouterLocation | undefined;
        try {
          await beforeLoad({ params: match.params, search: Object.fromEntries(new URLSearchParams(location.search)), context, location,
            setContext: update => { context = typeof update === 'function' ? update(context) : update; },
            redirect: async to => {
              redirected = typeof to === 'string'
                ? splitLocation(to)
                : { pathname: to.pathname, search: formatSearch(to.search), state: to.state };
            },
          });
        } catch (error) {
          errors.set(match.route.id, toError(error));
          break;
        }
        if (redirected) {
          if (seq !== navigationSeq || controller.signal.aborted) return;
          await loadLocation(redirected, { replace: true });
          return;
        }
      }
      if (seq !== navigationSeq || controller.signal.aborted) return;
      try {
        const value = await runLoader(match, location, controller.signal);
        if (seq !== navigationSeq || controller.signal.aborted) return;
        if (match.route.options.loader) data.set(routeKey(match.route, location), value);
        revalidated.push(match);
      } catch (error) {
        errors.set(match.route.id, toError(error));
        break;
      }
    }
    if (seq !== navigationSeq || controller.signal.aborted) return;
    const status = errors.size ? 'error' : 'active';
    snapshot = { location, status, matches, data, errors };
    if (options.fromPop) { history.replaceState(location.state ?? null, '', `${location.pathname}${location.search}`); emit(); }
    else commit({ location, status, matches, data, errors }, options.replace, false);
    for (const match of revalidated) {
      const afterLoad = match.route.options.afterLoad;
      if (!afterLoad) continue;
      try { await afterLoad({ params: match.params, search: Object.fromEntries(new URLSearchParams(location.search)), context, location }); }
      catch (error) { console.error('[typed-router] afterLoad failed:', error); }
    }
    schedulePolling(matches, location);
    scheduleGc(matches, location);
    const activeKey = `${location.pathname}${location.search}`;
    if (options.fromPop && matches.at(-1)?.route.options.scrollRestoration) {
      const position = savedScroll.get(activeKey);
      if (position) requestAnimationFrame(() => window.scrollTo({ left: position.x, top: position.y }));
    } else if (matches.at(-1)?.route.options.scrollRestoration) requestAnimationFrame(() => window.scrollTo({ left: 0, top: 0 }));
  } catch (error) {
    if (seq !== navigationSeq || controller.signal.aborted) return;
    const fallback = matches.at(-1);
    if (fallback) errors.set(fallback.route.id, toError(error));
    snapshot = { location, status: 'error', matches, data, errors };
    if (options.fromPop) { history.replaceState(location.state ?? null, '', `${location.pathname}${location.search}`); emit(); }
    else commit({ location, status: 'error', matches, data, errors }, options.replace, false);
  }
};
let pollTimer: ReturnType<typeof setInterval> | undefined;
const schedulePolling = (matches: RouteMatch[], location: RouterLocation) => {
  if (pollTimer) clearInterval(pollTimer);
  const target = [...matches].reverse().find(match => match.route.options.pollingInterval);
  if (!target) return;
  pollTimer = setInterval(() => { void runLoader(target, location, new AbortController().signal, true, 'polling').then(value => {
    if (`${snapshot.location.pathname}${snapshot.location.search}` !== `${location.pathname}${location.search}`) return;
    const data = new Map(snapshot.data); data.set(routeKey(target.route, location), value); snapshot = { ...snapshot, data }; emit();
  }).catch(error => console.error('[typed-router] polling failed:', error)); }, target.route.options.pollingInterval);
};
const scheduleGc = (matches: RouteMatch[], location: RouterLocation) => {
  const activeKeys = new Set(matches.map(match => routeKey(match.route, location)));
  for (const [key, entry] of cache) {
    if (activeKeys.has(key)) { if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined; continue; }
    if (!entry.gcTime || entry.timer) continue;
    entry.timer = setTimeout(() => { cache.delete(key); }, entry.gcTime);
  }
};
const navigate = async (target: Parameters<RouterRuntime['navigate']>[0]) => {
  if (target === -1) { history.back(); return; }
  const next = typeof target === 'string' ? splitLocation(target) : resolveTarget(target);
  await loadLocation(next);
};
navigateImpl = loadLocation;
const parseCacheKey = (key: string) => { const separator = key.indexOf('|'); return { id: key.slice(0, separator), url: key.slice(separator + 1) }; };
const splitUrl = (url: string) => { const index = url.indexOf('?'); return index === -1 ? { pathname: url, search: '' } : { pathname: url.slice(0, index), search: url.slice(index) }; };
const matchesPath = (pattern: string, pathname: string, exact: boolean) => {
  const expected = splitPath(pattern);
  const actual = splitPath(pathname);
  if (exact ? actual.length !== expected.length : actual.length < expected.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part.startsWith('$') || part === actual[index]);
};
export const routerRuntime: RouterRuntime = {
  navigate,
  async invalidate(target, options) {
    let targetPath: string;
    let targetSearch: string | undefined;
    if (target === undefined) {
      targetPath = snapshot.location.pathname;
      targetSearch = snapshot.location.search;
    } else if (typeof target === 'string') {
      const split = splitLocation(target);
      targetPath = split.pathname;
      targetSearch = target.includes('?') ? split.search : undefined;
    } else {
      targetPath = resolveTarget(target).pathname;
      targetSearch = undefined;
    }
    const isPattern = splitPath(targetPath).some(part => part.startsWith(':') || part.startsWith('$'));
    const locations = new Map<string, RouterLocation>();
    const addLocation = (pathname: string, search: string) => { const url = `${pathname}${search}`; if (!locations.has(url)) locations.set(url, { pathname, search }); };
    for (const key of cache.keys()) {
      const { url } = parseCacheKey(key);
      const cached = splitUrl(url);
      const matches = isPattern
        ? matchesPath(targetPath, cached.pathname, !options?.withChildren)
        : targetSearch !== undefined
          ? cached.pathname === targetPath && cached.search === targetSearch
          : matchesPath(targetPath, cached.pathname, !options?.withChildren);
      if (matches) addLocation(cached.pathname, cached.search);
    }
    if (!isPattern && options?.force !== false && !options?.staleOnly) addLocation(targetPath, targetSearch ?? '');
    const seen = new Set<string>();
    for (const location of locations.values()) {
      const matches = matchRoutes(location.pathname, location);
      for (const match of matches) {
        const key = routeKey(match.route, location);
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = cache.get(key);
        if (options?.staleOnly && isFresh(entry)) continue;
        const shouldRun = entry ? true : !isPattern && options?.force !== false && !options?.staleOnly;
        if (!shouldRun) continue;
        if (entry?.timer) clearTimeout(entry.timer);
        cache.delete(key);
        try {
          const value = await runLoader(match, location, new AbortController().signal, true, 'invalidate');
          if (!isSameLocation(location, snapshot.location)) continue;
          const data = new Map(snapshot.data);
          const errors = new Map(snapshot.errors);
          if (match.route.options.loader) data.set(key, value);
          else data.delete(key);
          errors.delete(match.route.id);
          snapshot = { ...snapshot, data, errors, status: errors.size ? 'error' : 'active' };
          emit();
        } catch (error) {
          if (!isSameLocation(location, snapshot.location)) continue;
          const errors = new Map(snapshot.errors);
          errors.set(match.route.id, toError(error));
          snapshot = { ...snapshot, errors, status: 'error' };
          emit();
        }
      }
    }
  },
  async prefetch(target) {
    const location = typeof target === 'string' ? splitLocation(target) : resolveTarget(target);
    if (isSameLocation(location, snapshot.location)) return;
    const matches = matchRoutes(location.pathname, location);
    for (const match of matches) await runLoader(match, location, new AbortController().signal, false, 'prefetch');
  },
};
export const resetRouterState = () => {
  activeController?.abort();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  for (const flight of flights.values()) flight.controller.abort();
  for (const entry of cache.values()) if (entry.timer) clearTimeout(entry.timer);
  cache.clear();
  flights.clear();
  savedScroll.clear();
  routeErrors.clear();
  context = {};
  blocker = undefined;
  blockedTarget = undefined;
  bypassBlockerOnce = false;
  suppressPopstate = false;
  routes = undefined;
  maxCacheSize = 100;
  navigationSeq++;
  snapshot = { location: initialLocation(), status: 'idle', matches: [], data: new Map(), errors: routeErrors };
};
export const setRouterConfig = (root: RouteNode, size?: number) => { routes = root; if (size) maxCacheSize = size; };
export const handlePopState = () => {
  if (suppressPopstate) { suppressPopstate = false; return; }
  const location = { pathname: window.location.pathname, search: window.location.search, state: window.history.state };
  if (blocker?.({ current: snapshot.location, next: location })) {
    blockedTarget = location;
    suppressPopstate = true;
    history.forward();
    emit();
    return;
  }
  return loadLocation(location, { fromPop: true });
};
export const setBlocker = (fn?: Blocker) => { blocker = fn; };
export const getBlockedTarget = () => blockedTarget;
export const clearBlockedTarget = () => { blockedTarget = undefined; };
export const processBlockedTarget = async () => { const target = blockedTarget; blockedTarget = undefined; if (target) { bypassBlockerOnce = true; await navigateImpl(target); } };
export const useRouteData = (id: string) => {
  const state = useRouterSnapshot();
  const match = state.matches.find(item => item.route.id === id);
  return { params: match?.params ?? {}, search: Object.fromEntries(new URLSearchParams(state.location.search)), data: match ? state.data.get(routeKey(match.route, state.location)) : undefined, status: state.status, error: state.errors.get(id) };
};
export const resetBlockedTarget = () => { blockedTarget = undefined; emit(); };
export const interpolateRoute = interpolate;
export const submitRouteAction = async (name: string, input: Record<string, unknown>) => {
  const leaf = snapshot.matches.at(-1);
  if (!leaf?.route.options.actions) throw new Error('No actions are defined for the active route');
  const args = { params: leaf.params, search: Object.fromEntries(new URLSearchParams(snapshot.location.search)), context, location: snapshot.location,
    setContext: (update: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>)) => { context = typeof update === 'function' ? update(context) : update; },
    redirect: async (_to: string) => {},
  };
  const action = leaf.route.options.actions(args)[name];
  if (!action) throw new Error(`Action "${name}" is not defined for route ${leaf.route.id}`);
  const start = snapshot.location;
  const result = await action(input);
  await routerRuntime.invalidate(`${start.pathname}${start.search}`, { force: true });
  return result;
};
