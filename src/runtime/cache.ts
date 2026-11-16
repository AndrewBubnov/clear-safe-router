import { LAZY_MARKER } from '../constants';
import type { CacheReason, CacheSnapshotEntry, LazyComponent, RouteMatch, RouterLocation } from '../types';
import { routerConfig } from './config';
import { activeControllerRef, cache, cacheSnapshotStore, contextStore, flights, listeners, routeKey, snapshot, type CacheEntry, type Flight } from './state';

const isFresh = (entry?: CacheEntry) => !!entry && (Date.now() - entry.updatedAt < entry.staleTime || (entry.reason === 'prefetch' && (entry.prefetchedUntil ?? 0) > Date.now()));
const touch = (key: string, entry: CacheEntry) => { cache.delete(key); entry.lastUsed = Date.now(); cache.set(key, entry); };
const evict = () => {
  while (cache.size > routerConfig.maxCacheSize) {
    // Active entries are computed from the matched chain: a parent's key no longer
    // ends with the current URL once keys are route-scoped, so a set is required.
    const activeKeys = new Set(snapshot().matches.map(match => routeKey(match.route, snapshot().location)));
    const oldest = [...cache.keys()].find(key => !activeKeys.has(key)) ?? cache.keys().next().value;
    if (!oldest) break;
    const entry = cache.get(oldest);
    if (entry?.timer) clearTimeout(entry.timer);
    cache.delete(oldest);
  }
};
const buildCacheSnapshot = (): CacheSnapshotEntry[] => {
  const entries: CacheSnapshotEntry[] = [...cache.entries()].map(([key, entry]) => {
    const url = key.slice(key.indexOf('|') + 1);
    const flight = flights.get(key);
    return {
      path: url,
      data: entry.value,
      timestamp: entry.updatedAt,
      staleTime: Number.isFinite(entry.staleTime) ? entry.staleTime : undefined,
      reason: entry.reason,
      gcExpiresAt: entry.gcExpiresAt ?? undefined,
      gcDuration: entry.gcTime,
      isCached: true,
      isLoading: !!flight && !flight.signal.aborted,
    };
  });
  for (const [key, flight] of flights) {
    if (cache.has(key) || flight.signal.aborted) continue;
    entries.push({ path: key.slice(key.indexOf('|') + 1), data: undefined, timestamp: Date.now(), staleTime: undefined, gcExpiresAt: undefined, gcDuration: undefined, isCached: false, isLoading: true });
  }
  return entries;
};
export const syncCacheSnapshot = () => cacheSnapshotStore.setState(routerConfig.enableCacheSnapshot ? buildCacheSnapshot() : []);
export const emit = () => {
  if (routerConfig.enableCacheSnapshot) cacheSnapshotStore.setState(buildCacheSnapshot());
  listeners.forEach(listener => listener());
};
export const runLoader = (match: RouteMatch, location: RouterLocation, signal: AbortSignal, force = false, reason: CacheReason = 'navigation', contextOverride?: Record<string, unknown>): Promise<unknown> => {
  const loader = match.route.options.loader;
  if (!loader) return Promise.resolve(undefined);
  const key = routeKey(match.route, location);
  const existing = flights.get(key);
  if (existing && !existing.signal.aborted) {
    if (signal === activeControllerRef.current?.signal && existing.signal !== signal) { existing.controller.abort(); flights.delete(key); }
    else return existing.promise;
  }
  if (existing?.signal.aborted) { existing.controller.abort(); flights.delete(key); }
  const cached = cache.get(key);
  if (cached?.timer) { clearTimeout(cached.timer); cached.timer = undefined; }
  if (!force && isFresh(cached)) {
    if (reason === 'navigation' && cached?.reason === 'prefetch') { cached.reason = 'navigation'; cached.staleTime = match.route.options.staleTime ?? routerConfig.defaultStaleTime ?? 0; cached.prefetchedUntil = undefined; }
    touch(key, cached!); return Promise.resolve(cached!.value);
  }
  const token = {};
  let attempts = 0;
  const work = async (requestSignal: AbortSignal): Promise<unknown> => {
    attempts++;
    try {
      const value = await loader({ params: match.params, search: Object.fromEntries(new URLSearchParams(location.search)), context: contextOverride ?? contextStore.getState(), signal: requestSignal, attempt: attempts, location });
      if (requestSignal.aborted || flights.get(key)?.token !== token) return undefined;
      const previous = cache.get(key);
      if (previous?.timer) clearTimeout(previous.timer);
      const staleTime = match.route.options.staleTime ?? routerConfig.defaultStaleTime ?? 0;
      const entry: CacheEntry = { value, updatedAt: Date.now(), staleTime: reason === 'prefetch' ? Math.max(staleTime, 30_000) : staleTime, reason, prefetchedUntil: reason === 'prefetch' ? Date.now() + Math.max(0, 30_000 - staleTime) : undefined, gcTime: match.route.options.gcTime, lastUsed: Date.now() };
      cache.set(key, entry);
      evict();
      return value;
    } catch (error) {
      if (requestSignal.aborted || flights.get(key)?.token !== token) return undefined;
      const retry = match.route.options.retry ?? routerConfig.defaultRetry;
      const count = typeof retry === 'number' ? retry : retry?.count ?? 0;
      const delay = typeof retry === 'number' ? 0 : retry?.delay ?? 0;
      if (attempts <= count) { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); if (!requestSignal.aborted) return work(requestSignal); }
      throw error;
    }
  };
  const flight: Flight = { controller: new AbortController(), signal, token, promise: Promise.resolve() };
  const onAbort = () => flight.controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const onFlightAbort = () => { if (flights.get(key)?.token === token) flights.delete(key); };
  flight.controller.signal.addEventListener('abort', onFlightAbort, { once: true });
  flights.set(key, flight);
  emit();
  flight.promise = work(flight.controller.signal).finally(() => {
    signal.removeEventListener('abort', onAbort);
    flight.controller.signal.removeEventListener('abort', onFlightAbort);
    if (flights.get(key)?.token === token) flights.delete(key);
    emit();
  });
  return flight.promise;
};
export const isCacheFresh = isFresh;
export const clearCacheAndFlights = () => {
  for (const flight of flights.values()) flight.controller.abort();
  for (const entry of cache.values()) if (entry.timer) clearTimeout(entry.timer);
  cache.clear();
  flights.clear();
};
export const scheduleGc = (matches: RouteMatch[], location: RouterLocation) => {
  const activeKeys = new Set(matches.map(match => routeKey(match.route, location)));
  for (const [key, entry] of cache) {
    if (activeKeys.has(key)) { if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined; entry.gcExpiresAt = undefined; continue; }
    if (!entry.gcTime || entry.timer) continue;
    entry.gcExpiresAt = Date.now() + entry.gcTime;
    entry.timer = setTimeout(() => { cache.delete(key); }, entry.gcTime);
  }
};
export const prefetchLazyChunk = (matches: RouteMatch[]) => {
  const leafComponent = matches.at(-1)?.route.options.component;
  if (leafComponent && typeof leafComponent === 'object' && LAZY_MARKER in leafComponent) void (leafComponent as LazyComponent).importFn();
};
