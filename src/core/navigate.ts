import type { RouterLocation, RouterSnapshot, RouteMatch } from "./types";
import {
  activeControllerRef,
  blockerStateStore,
  blockedTargetStore,
  cache,
  committedLocationRef,
  contextStore,
  dataStore,
  loaderErrors,
  beforeLoadErrors,
  navigationSeqRef,
  routeKey,
  routesRef,
  snapshot as snapshotGetter,
  setSnapshot,
} from "./state";
import { emit, isCacheFresh, runLoader, scheduleGc } from "./cache";
import { captureScroll } from "./scroll";
import {
  formatSearch,
  matchRoutes,
  sleep,
  splitLocation,
  toError,
} from "./match";
import {
  routerConfig,
  type AfterLoadHook,
  type BeforeLoadHook,
} from "./config";
import { getRouterEnv } from "./env";

let pollTimer: ReturnType<typeof setInterval> | undefined;
const unmatchedRouteWarnings = new Set<string>();
const REDIRECT_LIMIT = 10;
export { REDIRECT_LIMIT };

/** Thrown by the guard's `redirect()` to abort the rest of the hook body —
 * code after `await redirect(...)` must not run. Caught by the guard chain. */
export class RedirectSignal extends Error {
  constructor(public target: RouterLocation) {
    super(`Redirect to ${target.pathname}${target.search}`);
  }
}
export const commit = (
  next: RouterSnapshot,
  replace = false,
  fromPop = false,
) => {
  const write = () => {
    const url = `${next.location.pathname}${next.location.search}`;
    const env = getRouterEnv();
    if (fromPop) {
      if (url !== env.currentUrl()) env.replace(url, next.location.state);
    } else if (replace) env.replace(url, next.location.state);
    else if (url !== env.currentUrl()) env.push(url, next.location.state);
    committedLocationRef.current = next.location;
    setSnapshot(next);
    emit();
  };
  if (!fromPop && routerConfig.isAnimated && getRouterEnv().startViewTransition) {
    getRouterEnv().startViewTransition!(
      write,
      routerConfig.animationDuration,
    );
  } else write();
};
export const loadLocation = async (
  location: RouterLocation,
  options: { replace?: boolean; fromPop?: boolean; prevLocation?: { pathname: string; search: string }; redirectDepth?: number } = {},
) => {
  if (!options.fromPop) captureScroll(snapshotGetter().location);
  if (blockerStateStore.getState() === "charged") {
    blockerStateStore.setState("blocked");
    blockedTargetStore.setState(location);
    emit();
    return;
  }
  if (blockerStateStore.getState() === "blocked") return;
  const seq = ++navigationSeqRef.current;
  activeControllerRef.current?.abort();
  const controller = new AbortController();
  activeControllerRef.current = controller;
  // `prevLocation` is threaded explicitly on guard redirects (the attempted URL);
  // otherwise it is the last committed location, or absent before the first one.
  // It is a flat projection (pathname + search only) — a pointer, not a history chain.
  const from = options.prevLocation ?? committedLocationRef.current;
  const prevLocation = from ? { pathname: from.pathname, search: from.search } : undefined;
  const nextLocation: RouterLocation = prevLocation ? { ...location, prevLocation } : { ...location };
  const matches = matchRoutes(location.pathname, location, routesRef.current);
  if (
    routerConfig.warnOnUnmatchedRoutes &&
    matches.length === 0 &&
    !unmatchedRouteWarnings.has(location.pathname)
  ) {
    unmatchedRouteWarnings.add(location.pathname);
    console.warn(
      `[clear-safe-router] No route matched "${location.pathname}". ` +
        "Add a catch-all route ({ path: '*' }) or check the route path.",
    );
  }
  const data = new Map<string, unknown>();
  const errors = new Map<string, Error>();
  let needsLoading = false;
  let optimistic = false;
  for (const match of matches) {
    const entry = cache.get(routeKey(match.route, location));
    if (entry && (isCacheFresh(entry) || match.route.options.optimistic))
      data.set(routeKey(match.route, location), entry.value);
    if (entry && match.route.options.optimistic) optimistic = true;
    if (match.route.options.loader && !isCacheFresh(entry)) needsLoading = true;
  }
  setSnapshot({
    ...snapshotGetter(),
    location: nextLocation,
    status: optimistic ? "optimistic" : needsLoading ? "pending" : "active",
    matches,
    data,
    errors,
  });
  dataStore.setState(new Map(data));
  emit();
  try {
    // Phase 1 — beforeLoad guards, run for the whole matched chain (parent → leaf)
    // BEFORE any loader. The global hook runs first (with the leaf's params, as before);
    // a redirect or a thrown error at any level prevents the loader phase entirely.
    if (matches.length > 0) {
      const leaf = matches.at(-1)!;
      const hooks: { hook: BeforeLoadHook; match: RouteMatch }[] = [];
      if (routerConfig.defaultBeforeLoad) hooks.push({ hook: routerConfig.defaultBeforeLoad, match: leaf });
      for (const match of matches)
        if (match.route.options.beforeLoad) hooks.push({ hook: match.route.options.beforeLoad, match });
      let guardFailed = false;
      for (const { hook, match } of hooks) {
        if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
        let redirected: RouterLocation | undefined;
        try {
          await hook({
            params: match.params,
            search: Object.fromEntries(new URLSearchParams(location.search)),
            context: contextStore.getState(),
            location,
            // The navigation owns the signal (superseded by the next navigation),
            // so in-flight guard work can cancel itself. The seq check below is
            // the only supersede decision — a dead guard's redirect is discarded.
            signal: controller.signal,
            setContext: (update) => {
              contextStore.setState(
                typeof update === "function"
                  ? (
                      update as (
                        previous: Record<string, unknown>,
                      ) => Record<string, unknown>
                    )(contextStore.getState())
                  : update,
              );
            },
            redirect: (to) => {
              const target =
                typeof to === "string"
                  ? splitLocation(to)
                  : {
                      pathname: to.pathname,
                      search: formatSearch(to.search),
                      state: to.state,
                    };
              if ((options.redirectDepth ?? 0) >= REDIRECT_LIMIT)
                throw new Error(
                  `[clear-safe-router] Redirect chain exceeded ${REDIRECT_LIMIT} hops — possible redirect loop at "${location.pathname}"`,
                );
              // Throws to interrupt the hook body; the chain below catches it.
              throw new RedirectSignal(target);
            },
          });
        } catch (error) {
          if (error instanceof RedirectSignal) {
            redirected = error.target;
          } else {
            beforeLoadErrors.set(match.route.id, toError(error));
            errors.set(match.route.id, toError(error));
            guardFailed = true;
            break;
          }
        }
        if (redirected) {
          if (seq !== navigationSeqRef.current || controller.signal.aborted)
            return;
          // The user tried to reach `location` — after a redirect that attempted
          // URL stays `prevLocation` (e.g. for a "back to the page you wanted" link).
          await loadLocation(redirected, {
            replace: true,
            prevLocation: { pathname: location.pathname, search: location.search },
            redirectDepth: (options.redirectDepth ?? 0) + 1,
          });
          return;
        }
      }
      // Phase 2 — loaders, only when every guard on the chain passed.
      if (!guardFailed) {
    const revalidated: RouteMatch[] = [];
    for (const match of matches) {
      if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
      try {
        const minDuration =
          match.route.options.minLoaderDuration ??
          routerConfig.defaultMinLoaderDuration;
        let value: unknown;
        if (
          match.route.options.loader &&
          minDuration &&
          !isCacheFresh(cache.get(routeKey(match.route, location)))
        ) {
          [value] = await Promise.all([
            runLoader(match, location, controller.signal),
            sleep(minDuration),
          ]);
        } else {
          value = await runLoader(match, location, controller.signal);
        }
        if (seq !== navigationSeqRef.current || controller.signal.aborted)
          return;
        if (match.route.options.loader)
          data.set(routeKey(match.route, location), value);
        loaderErrors.delete(match.route.id);
        beforeLoadErrors.delete(match.route.id);
        revalidated.push(match);
      } catch (error) {
        loaderErrors.set(match.route.id, toError(error));
        errors.set(match.route.id, toError(error));
        break;
      }
    }
    } // end of the loader phase (skipped entirely when a beforeLoad guard failed)
    } // end of the guard chain block
    if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
    const status = errors.size ? "error" : "active";
    setSnapshot({ location: nextLocation, status, matches, data, errors });
    dataStore.setState(new Map(data));
    if (options.fromPop) {
      committedLocationRef.current = nextLocation;
      getRouterEnv().replace(
        `${location.pathname}${location.search}`,
        location.state,
      );
      emit();
    } else
      commit(
        { location: nextLocation, status, matches, data, errors },
        options.replace,
        false,
      );
    const afterLoadLeaf = matches.at(-1);
    if (afterLoadLeaf) {
      const hooks: AfterLoadHook[] = [];
      if (afterLoadLeaf.route.options.afterLoad)
        hooks.push(afterLoadLeaf.route.options.afterLoad);
      if (routerConfig.defaultAfterLoad)
        hooks.push(routerConfig.defaultAfterLoad);
      for (const hook of hooks) {
        try {
          await hook({
            params: afterLoadLeaf.params,
            search: Object.fromEntries(new URLSearchParams(location.search)),
            context: contextStore.getState(),
            location,
          });
        } catch (error) {
          console.error("[clear-safe-router] afterLoad failed:", error);
        }
      }
    }
    schedulePolling(matches, location);
    scheduleGc(matches, location);
  } catch (error) {
    if (seq !== navigationSeqRef.current || controller.signal.aborted) return;
    const fallback = matches.at(-1);
    if (fallback) errors.set(fallback.route.id, toError(error));
    setSnapshot({ location: nextLocation, status: "error", matches, data, errors });
    dataStore.setState(new Map(data));
    // Re-evaluate polling even on a failed load: the old timer for the previous
    // location must not keep polling in the background.
    schedulePolling(matches, location);
    if (options.fromPop) {
      getRouterEnv().replace(
        `${location.pathname}${location.search}`,
        location.state,
      );
      emit();
    } else
      commit(
        { location: nextLocation, status: "error", matches, data, errors },
        options.replace,
        false,
      );
  }
};
/** Runs the beforeLoad guard chain (parent → leaf) for prefetch purposes only.
 * Returns whether real navigation would reach this route, plus a LOCAL context:
 * guards may call setContext (e.g. preparing a token for the loader), and that
 * value flows into the prefetch loaders — without ever touching the global
 * context store, so a parallel real navigation is unaffected.
 * Guards receive the prefetch attempt's own signal: a viewport/render prefetch
 * aborted from the outside cancels in-flight guard work too. There is no
 * supersede chain — the caller's signal is the whole lifecycle.
 * Keep the hook-argument shape in sync with the guard phase of `loadLocation`. */
export const guardsAllowPrefetch = async (
  matches: RouteMatch[],
  location: RouterLocation,
  signal: AbortSignal,
): Promise<{ allowed: boolean; context: Record<string, unknown> }> => {
  if (matches.length === 0) return { allowed: true, context: { ...contextStore.getState() } };
  const leaf = matches.at(-1)!;
  const hooks: { hook: BeforeLoadHook; params: Record<string, string> }[] = [];
  if (routerConfig.defaultBeforeLoad) hooks.push({ hook: routerConfig.defaultBeforeLoad, params: leaf.params });
  for (const match of matches)
    if (match.route.options.beforeLoad) hooks.push({ hook: match.route.options.beforeLoad, params: match.params });
  // The whole chain (guard → loader) shares this local context; the global store
  // is never written.
  let localContext: Record<string, unknown> = { ...contextStore.getState() };
  for (const { hook, params } of hooks) {
    try {
      await hook({
        params,
        search: Object.fromEntries(new URLSearchParams(location.search)),
        context: localContext,
        location,
        signal,
        setContext: (update) => {
          localContext =
            typeof update === "function"
              ? (update as (previous: Record<string, unknown>) => Record<string, unknown>)(localContext)
              : update;
        },
        redirect: (to) => {
          const target =
            typeof to === "string"
              ? splitLocation(to)
              : { pathname: to.pathname, search: formatSearch(to.search), state: to.state };
          throw new RedirectSignal(target);
        },
      });
    } catch {
      // A thrown RedirectSignal (or any guard error) means real navigation
      // would not have reached this route — do not prefetch it.
      return { allowed: false, context: localContext };
    }
  }
  return { allowed: true, context: localContext };
};
export const schedulePolling = (
  matches: RouteMatch[],
  location: RouterLocation,
) => {
  if (pollTimer) clearInterval(pollTimer);
  const target = [...matches]
    .reverse()
    .find((match) => match.route.options.pollingInterval);
  if (!target) return;
  pollTimer = setInterval(() => {
    // Check freshness BEFORE spending the request: once the user navigated away,
    // the old location must not keep polling.
    const current = snapshotGetter().location;
    if (
      `${current.pathname}${current.search}` !== `${location.pathname}${location.search}`
    )
      return;
    void runLoader(
      target,
      location,
      new AbortController().signal,
      true,
      "polling",
    )
      .then((value) => {
        if (
          `${snapshotGetter().location.pathname}${
            snapshotGetter().location.search
          }` !== `${location.pathname}${location.search}`
        )
          return;
        // Only the data slice changes: route/status/location subscribers must not re-render.
        dataStore.setState((previous) => {
          const next = new Map(previous);
          next.set(routeKey(target.route, location), value);
          return next;
        });
        emit();
      })
      .catch((error) => console.error("[clear-safe-router] polling failed:", error));
  }, target.route.options.pollingInterval);
};
export const stopPolling = () => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
};
