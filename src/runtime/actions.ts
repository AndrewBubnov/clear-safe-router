import type {
  RouterLocation,
  InvalidateOptions,
  InvalidateResult,
  RouterRuntime,
  RouteNode,
} from "../types";
import {
  activeControllerRef,
  blockerStateStore,
  blockedTargetStore,
  cache,
  cacheSnapshotStore,
  contextStore,
  dataStore,
  flights,
  loaderErrors,
  beforeLoadErrors,
  committedLocationRef,
  navigationSeqRef,
  routeErrors,
  routeKey,
  routesRef,
  snapshot,
  snapshotRef,
  suppressPopstateRef,
  updateSnapshot,
  initialLocation,
  scrollMap,
} from "./state";
import {
  emit as emitSnapshot,
  isCacheFresh,
  runLoader,
  clearCacheAndFlights,
  prefetchLazyChunk,
} from "./cache";
import {
  matchRoutes,
  splitLocation,
  resolveTarget,
  toError,
  isSameLocation,
  matchesPath,
  parseCacheKey,
  splitUrl,
} from "./match";
import { loadLocation, stopPolling, guardsAllowPrefetch } from "./navigate";
import { captureScroll } from "./scroll";
import { routerConfig } from "./config";

export const navigate = async (
  target: Parameters<RouterRuntime["navigate"]>[0],
) => {
  if (target === -1) {
    history.back();
    return;
  }
  const next =
    typeof target === "string" ? splitLocation(target) : resolveTarget(target);
  await loadLocation(next, {
    replace: typeof target !== "string" && target.replace === true,
  });
};
export const invalidate = async (
  target?: string | string[] | { to: string; params?: Record<string, string> },
  options?: InvalidateOptions,
): Promise<InvalidateResult[]> => {
  if (Array.isArray(target)) {
    const results: InvalidateResult[] = [];
    for (const entry of target)
      results.push(...(await invalidate(entry, options)));
    return results;
  }
  let targetPath: string;
  let targetSearch: string | undefined;
  if (target === undefined) {
    targetPath = snapshot().location.pathname;
    targetSearch = snapshot().location.search;
  } else if (typeof target === "string") {
    const split = splitLocation(target);
    targetPath = split.pathname;
    targetSearch = target.includes("?") ? split.search : undefined;
  } else {
    targetPath = resolveTarget(target).pathname;
    targetSearch = undefined;
  }
  const isBracketSegment = (part: string) => /^\[[^\]]+]$/.test(part);
  const isPattern = targetPath
    .split("/")
    .filter(Boolean)
    .some(
      (part) =>
        part.startsWith(":") || part.startsWith("$") || isBracketSegment(part),
    );
  const locations = new Map<string, RouterLocation>();
  const addLocation = (pathname: string, search: string) => {
    const url = `${pathname}${search}`;
    if (!locations.has(url)) locations.set(url, { pathname, search });
  };
  for (const key of cache.keys()) {
    const { url } = parseCacheKey(key);
    const cached = splitUrl(url);
    const matches = isPattern
      ? matchesPath(targetPath, cached.pathname, !options?.withChildren)
      : targetSearch !== undefined
        ? // A target with search revalidates every cached search variant of that pathname.
          cached.pathname === targetPath
        : matchesPath(targetPath, cached.pathname, !options?.withChildren);
    if (matches) addLocation(cached.pathname, cached.search);
  }
  if (!isPattern && options?.force !== false && !options?.staleOnly)
    addLocation(targetPath, targetSearch ?? "");
  const results: InvalidateResult[] = [];
  const seen = new Set<string>();
  for (const location of locations.values()) {
    const matches = matchRoutes(location.pathname, location, routesRef.current);
    const leaf = matches.at(-1);
    // Original semantics: a concrete path invalidates its matched route only;
    // withChildren widens the cached-path match to a prefix, so every descendant
    // URL is revalidated at its own location with its own params.
    if (!leaf) continue;
    for (const match of [leaf]) {
      const key = `${match.route.id}|${location.pathname}${location.search}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = cache.get(key);
      if (options?.staleOnly && isCacheFresh(entry)) continue;
      const shouldRun = entry
        ? true
        : !isPattern && options?.force !== false && !options?.staleOnly;
      if (!shouldRun) continue;
      if (entry?.timer) clearTimeout(entry.timer);
      cache.delete(key);
      // Original semantics: an in-flight load for this path is awaited, then a fresh
      // forced refetch runs — the stale result is never returned to the caller.
      const flight = flights.get(key);
      if (flight && !flight.signal.aborted)
        await flight.promise.catch(() => {});
      try {
        const value = await runLoader(
          match,
          location,
          new AbortController().signal,
          true,
          "invalidate",
        );
        results.push({
          path: `${location.pathname}${location.search}`,
          data: value,
          error: null,
        });
        if (!isSameLocation(location, snapshot().location)) continue;
        updateSnapshot((previous) => {
          const data = new Map(dataStore.getState());
          const errors = new Map(previous.errors);
          errors.delete(match.route.id);
          if (match.route.options.loader) data.set(key, value);
          else data.delete(key);
          dataStore.setState(data);
          return {
            ...previous,
            data,
            errors,
            status: errors.size ? ("error" as const) : ("active" as const),
          };
        });
        loaderErrors.delete(match.route.id);
        beforeLoadErrors.delete(match.route.id);
        emitSnapshot();
      } catch (error) {
        const normalized = toError(error);
        results.push({
          path: `${location.pathname}${location.search}`,
          data: null,
          error: normalized,
        });
        if (!isSameLocation(location, snapshot().location)) continue;
        updateSnapshot((previous) => {
          const errors = new Map(previous.errors);
          errors.set(match.route.id, normalized);
          return { ...previous, errors, status: "error" as const };
        });
        emitSnapshot();
      }
    }
  }
  return results;
};
const runPrefetch = async (
  target: string | { to: string; params?: Record<string, string> },
) => {
  const location =
    typeof target === "string" ? splitLocation(target) : resolveTarget(target);
  if (isSameLocation(location, snapshot().location)) return;
  const matches = matchRoutes(location.pathname, location, routesRef.current);
  // Guards run before prefetch loaders: a protected route is never prefetched,
  // so its data cannot end up cached without authorization. The guard chain's
  // LOCAL context (guard setContext → loader) feeds the loaders.
  const guard = await guardsAllowPrefetch(matches, location);
  if (!guard.allowed) return;
  for (const match of matches)
    await runLoader(
      match,
      location,
      new AbortController().signal,
      false,
      "prefetch",
      guard.context,
    );
  prefetchLazyChunk(matches);
};
const prefetchQueue: (() => Promise<void>)[] = [];
let activePrefetches = 0;
const maxConcurrentPrefetches = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches &&
  window.matchMedia("(max-width: 768px)").matches
    ? 2
    : 4;
const drainPrefetchQueue = () => {
  const max = maxConcurrentPrefetches();
  while (activePrefetches < max && prefetchQueue.length) {
    activePrefetches++;
    void prefetchQueue.shift()!();
  }
};
export const prefetch = (
  target: string | { to: string; params?: Record<string, string> },
) =>
  new Promise<void>((resolve) => {
    const task = async () => {
      try {
        await runPrefetch(target);
      } catch {
        /* prefetch is best effort */
      } finally {
        activePrefetches--;
        resolve();
        drainPrefetchQueue();
      }
    };
    prefetchQueue.push(task);
    drainPrefetchQueue();
  });
export const handlePopState = () => {
  if (suppressPopstateRef.current) {
    const expected = suppressPopstateRef.current;
    suppressPopstateRef.current = null;
    if (`${window.location.pathname}${window.location.search}` === expected) return;
  }

  // Leaving the current page via history buttons must save its scroll too —
  // loadLocation skips capture on the popstate path by design.
  captureScroll(snapshot().location);
  const location = {
    pathname: window.location.pathname,
    search: window.location.search,
    state: window.history.state,
  };
  if (
    blockerStateStore.getState() === "blocked" ||
    blockerStateStore.getState() === "charged"
  ) {
    if (blockerStateStore.getState() === "charged") {
      blockerStateStore.setState("blocked");
      blockedTargetStore.setState(location);
    }
    suppressPopstateRef.current = `${snapshot().location.pathname}${snapshot().location.search}`;
    history.forward();
    emitSnapshot();
    return;
  }
  return loadLocation(location, { fromPop: true });
};
export const processBlockedTarget = async () => {
  const target = blockedTargetStore.getState();
  blockedTargetStore.setState(null);
  if (target) {
    blockerStateStore.setState("unblocked");
    await loadLocation(target);
  }
};
export const setRouterConfig = (root: RouteNode, size?: number) => {
  routesRef.current = root;
  if (size) routerConfig.maxCacheSize = size;
};
export const resetRouterState = () => {
  activeControllerRef.current?.abort();
  clearCacheAndFlights();
  loaderErrors.clear();
  beforeLoadErrors.clear();
  routeErrors.clear();
  scrollMap.clear();
  contextStore.setState({});
  blockerStateStore.setState("unblocked");
  blockedTargetStore.setState(null);
  cacheSnapshotStore.setState([]);
  suppressPopstateRef.current = null;
  routesRef.current = undefined;
  navigationSeqRef.current++;
  committedLocationRef.current = undefined;
  snapshotRef.current = {
    location: initialLocation(),
    status: "idle",
    matches: [],
    data: new Map(),
    errors: routeErrors,
  };
  dataStore.setState(new Map());
  stopPolling();
};
export const setupRevalidation = () => {
  const focusHandler = () => {
    if (
      document.visibilityState === "visible" &&
      routerConfig.revalidateOnFocus
    )
      void invalidate(undefined, { staleOnly: true });
  };
  const onlineHandler = () => {
    if (routerConfig.revalidateOnReconnect)
      void invalidate(undefined, { staleOnly: true });
  };
  document.addEventListener("visibilitychange", focusHandler);
  window.addEventListener("online", onlineHandler);
  return () => {
    document.removeEventListener("visibilitychange", focusHandler);
    window.removeEventListener("online", onlineHandler);
  };
};
export const updateSearchParams = (
  keyOrUpdate: string | ((previous: URLSearchParams) => URLSearchParams),
  value?: string | string[] | null,
) => {
  const previous = new URLSearchParams(snapshot().location.search);
  const nextSearch =
    typeof keyOrUpdate === "function"
      ? keyOrUpdate(previous)
      : (() => {
          const params = new URLSearchParams(previous);
          params.delete(keyOrUpdate);
          if (Array.isArray(value))
            value.forEach((item) => params.append(keyOrUpdate, item));
          else if (value !== undefined && value !== null)
            params.set(keyOrUpdate, value);
          return params;
        })();
  const search = nextSearch.toString();
  const previousLocation = snapshot().location;
  const location = { ...previousLocation, search: search ? `?${search}` : "" };
  history.replaceState(
    location.state ?? null,
    "",
    `${location.pathname}${location.search}`,
  );
  updateSnapshot((previous) => ({ ...previous, location }));
  // Keep the data rendered for the active matches: a search-only update must not
  // blank the page until the next invalidation refetches with the new search.
  if (
    `${previousLocation.pathname}${previousLocation.search}` !==
    `${location.pathname}${location.search}`
  ) {
    dataStore.setState((previous) => {
      const next = new Map(previous);
      for (const match of snapshot().matches) {
        const oldKey = routeKey(match.route, previousLocation);
        const newKey = routeKey(match.route, location);
        if (oldKey === newKey || !previous.has(oldKey)) continue;
        next.set(newKey, previous.get(oldKey));
        next.delete(oldKey);
      }
      return next;
    });
  }
  emitSnapshot();
};
export const submitRouteAction = async (
  name: string,
  input: Record<string, unknown>,
) => {
  const leaf = snapshot().matches.at(-1);
  if (!leaf?.route.options.actions)
    throw new Error("No actions are defined for the active route");
  const args = {
    params: leaf.params,
    search: Object.fromEntries(new URLSearchParams(snapshot().location.search)),
    context: contextStore.getState(),
    location: snapshot().location,
    setContext: (
      update:
        | Record<string, unknown>
        | ((previous: Record<string, unknown>) => Record<string, unknown>),
    ) => {
      contextStore.setState(
        typeof update === "function" ? update(contextStore.getState()) : update,
      );
    },
    redirect: async (_to: string) => {},
  };
  const action = leaf.route.options.actions(args)[name];
  if (!action)
    throw new Error(
      `Action "${name}" is not defined for route ${leaf.route.id}`,
    );
  const start = snapshot().location;
  const result = await action(input);
  await invalidate(`${start.pathname}${start.search}`, { force: true });
  return result;
};
