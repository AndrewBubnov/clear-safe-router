import type { RouterLocation, RouterSnapshot, RouteMatch } from '../types';
import { activeControllerRef, blockerStateStore, blockedTargetStore, cache, contextStore, dataStore, loaderErrors, beforeLoadErrors, navigationSeqRef, routeKey, routesRef, snapshot as snapshotGetter, setSnapshot } from './state';
import { emit, isCacheFresh, runLoader, scheduleGc } from './cache';
import { captureScroll } from './scroll';
import { formatSearch, matchRoutes, sleep, splitLocation, toError } from './match';
import { routerConfig, type AfterLoadHook, type BeforeLoadHook } from './config';

let pollTimer: ReturnType<typeof setInterval> | undefined;
const unmatchedRouteWarnings = new Set<string>();
export const commit = (next: RouterSnapshot, replace = false, fromPop = false) => {
  const write = () => {
    const url = `${next.location.pathname}${next.location.search}`;
    if (fromPop) {
      if (url !== `${window.location.pathname}${window.location.search}`) history.replaceState(next.location.state ?? null, '', url);
    } else if (replace) history.replaceState(next.location.state ?? null, '', url);
    else if (url !== `${window.location.pathname}${window.location.search}`) history.pushState(next.location.state ?? null, '', url);
    setSnapshot(next);
    emit();
  };
  if (!fromPop && routerConfig.isAnimated && typeof document !== 'undefined' && document.startViewTransition) {
    if (routerConfig.animationDuration) document.documentElement.style.setProperty('--pg-transition-duration', `${routerConfig.animationDuration}ms`);
    try {
      const transition = document.startViewTransition(write);
      transition.finished.catch(() => {});
    } catch {
      write();
    }
  } else write();
};
export const loadLocation = async (location: RouterLocation, options: { replace?: boolean; fromPop?: boolean } = {}) => {
  if (!options.fromPop) captureScroll(snapshotGetter().location);
  if (blockerStateStore.getState() === 'charged') { blockerStateStore.setState('blocked'); blockedTargetStore.setState(location); emit(); return; }
  if (blockerStateStore.getState() === 'blocked') return;
  const seq = ++navigationSeqRef.current;
  activeControllerRef.current?.abort();
  const controller = new AbortController();
  activeControllerRef.current = controller;
  const matches = matchRoutes(location.pathname, location, routesRef.current);
  if (import.meta.env.DEV && matches.length === 0 && !unmatchedRouteWarnings.has(location.pathname)) {
    unmatchedRouteWarnings.add(location.pathname);
    console.warn(
      `[typed-router] No route matched "${location.pathname}". ` +
      'Add a catch-all route ({ path: \'*\' }) or check the route path.'
    );
  }
  const data = new Map<string, unknown>();
  const errors = new Map<string, Error>();
  let needsLoading = false;
  let optimistic = false;
  for (const match of matches) {
    const entry = cache.get(routeKey(match.route, location));
    if (entry && (isCacheFresh(entry) || match.route.options.optimistic)) data.set(routeKey(match.route, location), entry.value);
    if (entry && match.route.options.optimistic) optimistic = true;
    if (match.route.options.loader && !isCacheFresh(entry)) needsLoading = true;
  }
  setSnapshot({ ...snapshotGetter(), location, status: optimistic ? 'optimistic' : needsLoading ? 'pending' : 'active', matches, data, errors });
  dataStore.setState(new Map(data));
  emit();
  try {
    const revalidated: RouteMatch[] = [];
    for (const match of matches) {
      if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
      try {
        const minDuration = match.route.options.minLoaderDuration ?? routerConfig.defaultMinLoaderDuration;
        let value: unknown;
        if (match.route.options.loader && minDuration && !isCacheFresh(cache.get(routeKey(match.route, location)))) {
          [value] = await Promise.all([runLoader(match, location, controller.signal), sleep(minDuration)]);
        } else {
          value = await runLoader(match, location, controller.signal);
        }
        if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
        if (match.route.options.loader) data.set(routeKey(match.route, location), value);
        loaderErrors.delete(match.route.id);
        beforeLoadErrors.delete(match.route.id);
        revalidated.push(match);
      } catch (error) {
        loaderErrors.set(match.route.id, toError(error));
        errors.set(match.route.id, toError(error));
        break;
      }
    }
    if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
    // Original semantics: beforeLoad runs for the matched route (plus the global one), not inherited.
    const leaf = matches.at(-1);
    if (leaf) {
      const hooks: BeforeLoadHook[] = [];
      if (routerConfig.defaultBeforeLoad) hooks.push(routerConfig.defaultBeforeLoad);
      if (leaf.route.options.beforeLoad) hooks.push(leaf.route.options.beforeLoad);
      for (const hook of hooks) {
        if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
        let redirected: RouterLocation | undefined;
        try {
          await hook({ params: leaf.params, search: Object.fromEntries(new URLSearchParams(location.search)), context: contextStore.getState(), location,
            setContext: update => { contextStore.setState(typeof update === 'function' ? (update as (previous: Record<string, unknown>) => Record<string, unknown>)(contextStore.getState()) : update); },
            redirect: async to => {
              redirected = typeof to === 'string'
                ? splitLocation(to)
                : { pathname: to.pathname, search: formatSearch(to.search), state: to.state };
            },
          });
        } catch (error) {
          beforeLoadErrors.set(leaf.route.id, toError(error));
          errors.set(leaf.route.id, toError(error));
          break;
        }
        if (redirected) {
          if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
          await loadLocation(redirected, { replace: true });
          return;
        }
      }
    }
    if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
    const status = errors.size ? 'error' : 'active';
    setSnapshot({ location, status, matches, data, errors });
    dataStore.setState(new Map(data));
    if (options.fromPop) { history.replaceState(location.state ?? null, '', `${location.pathname}${location.search}`); emit(); }
    else commit({ location, status, matches, data, errors }, options.replace, false);
    if (leaf) {
      const hooks: AfterLoadHook[] = [];
      if (leaf.route.options.afterLoad) hooks.push(leaf.route.options.afterLoad);
      if (routerConfig.defaultAfterLoad) hooks.push(routerConfig.defaultAfterLoad);
      for (const hook of hooks) {
        try { await hook({ params: leaf.params, search: Object.fromEntries(new URLSearchParams(location.search)), context: contextStore.getState(), location }); }
        catch (error) { console.error('[typed-router] afterLoad failed:', error); }
      }
    }
    schedulePolling(matches, location);
    scheduleGc(matches, location);
  } catch (error) {
    if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
    const fallback = matches.at(-1);
    if (fallback) errors.set(fallback.route.id, toError(error));
    setSnapshot({ location, status: 'error', matches, data, errors });
    dataStore.setState(new Map(data));
    if (options.fromPop) { history.replaceState(location.state ?? null, '', `${location.pathname}${location.search}`); emit(); }
    else commit({ location, status: 'error', matches, data, errors }, options.replace, false);
  }
};
export const schedulePolling = (matches: RouteMatch[], location: RouterLocation) => {
  if (pollTimer) clearInterval(pollTimer);
  const target = [...matches].reverse().find(match => match.route.options.pollingInterval);
  if (!target) return;
  pollTimer = setInterval(() => { void runLoader(target, location, new AbortController().signal, true, 'polling').then(value => {
    if (`${snapshotGetter().location.pathname}${snapshotGetter().location.search}` !== `${location.pathname}${location.search}`) return;
    // Only the data slice changes: route/status/location subscribers must not re-render.
    dataStore.setState(previous => { const next = new Map(previous); next.set(routeKey(target.route, location), value); return next; });
    emit();
  }).catch(error => console.error('[typed-router] polling failed:', error)); }, target.route.options.pollingInterval);
};
export const stopPolling = () => { if (pollTimer) clearInterval(pollTimer); pollTimer = undefined; };
