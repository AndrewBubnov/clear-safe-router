import type {
  RouterLocation,
  InvalidateOptions,
  InvalidateResult,
  RouterRuntime,
  RouteNode,
} from "./types";
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
  scheduleGc,
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
import {
  loadLocation,
  stopPolling,
  guardsAllowPrefetch,
  schedulePolling,
} from "./navigate";
import { captureScroll } from "./scroll";
import { routerConfig } from "./config";
import { getRouterEnv } from "./env";

export const navigate = async (
  target: Parameters<RouterRuntime["navigate"]>[0],
) => {
  if (target === -1) {
    getRouterEnv().back();
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
  // Canonical pathname (no trailing slash, no duplicate segments) so the target
  // key always matches the key the navigation wrote — a raw "/users/1/" would
  // otherwise produce a second, redundant loader run alongside the canonical one.
  const canonicalize = (value: string) => {
    const parts = value.split("/").filter(Boolean);
    return parts.length ? `/${parts.join("/")}` : "/";
  };
  if (target === undefined) {
    targetPath = canonicalize(snapshot().location.pathname);
    targetSearch = snapshot().location.search;
  } else if (typeof target === "string") {
    const split = splitLocation(target);
    targetPath = canonicalize(split.pathname);
    targetSearch = target.includes("?") ? split.search : undefined;
  } else {
    targetPath = canonicalize(resolveTarget(target).pathname);
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
    if (!leaf) continue;
    // Revalidate the whole matched chain (parent layouts first, leaf last): a
    // parent layout loader has its own cache key, and data it provides is part
    // of the page being invalidated. Loaderless non-leaf matches have nothing
    // to revalidate; the leaf keeps original no-op semantics (it yields a
    // result entry even without a loader). `seen` dedups parent keys shared by
    // several withChildren locations. `withChildren` widens the cached-path
    // match to a prefix, so every descendant URL is revalidated at its own
    // location with its own params.
    for (const match of matches) {
      if (match !== leaf && !match.route.options.loader) continue;
      const key = routeKey(match.route, location);
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
  signal?: AbortSignal,
) => {
  const attempt = signal ?? new AbortController().signal;
  if (attempt.aborted) return;
  const location =
    typeof target === "string" ? splitLocation(target) : resolveTarget(target);
  if (isSameLocation(location, snapshot().location)) return;
  const matches = matchRoutes(location.pathname, location, routesRef.current);
  // Guards run before prefetch loaders: a protected route is never prefetched,
  // so its data cannot end up cached without authorization. The guard chain's
  // LOCAL context (guard setContext → loader) feeds the loaders, and the guard
  // work itself shares the attempt's signal.
  const guard = await guardsAllowPrefetch(matches, location, attempt);
  if (!guard.allowed) return;
  for (const match of matches) {
    if (attempt.aborted) return;
    await runLoader(
      match,
      location,
      attempt,
      false,
      "prefetch",
      guard.context,
    );
  }
  // The core does not know about components: the adapter registers a warm-up
  // via `routerConfig.onPrefetch` (lazy chunk preloading lives in the view layer).
  routerConfig.onPrefetch?.(matches);
};
const prefetchQueue: (() => Promise<void>)[] = [];
let activePrefetches = 0;
const maxConcurrentPrefetches = () => (getRouterEnv().isSmallTouchDevice() ? 2 : 4);
const drainPrefetchQueue = () => {
  const max = maxConcurrentPrefetches();
  while (activePrefetches < max && prefetchQueue.length) {
    activePrefetches++;
    void prefetchQueue.shift()!();
  }
};
export const prefetch = (
  target: string | { to: string; params?: Record<string, string> },
  signal?: AbortSignal,
) =>
  new Promise<void>((resolve) => {
    const task = async () => {
      try {
        // An attempt aborted while queued silently skips on dequeue; the
        // promise still resolves and the queue drains as usual.
        if (!signal?.aborted) await runPrefetch(target, signal);
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
  const env = getRouterEnv();
  if (suppressPopstateRef.current.length > 0) {
    const expected = suppressPopstateRef.current[0]!;
    if (env.currentUrl() === expected) {
      suppressPopstateRef.current.shift();
      return;
    }
    // A different URL arrived while a revert was pending — the pending revert
    // is stale (the user raced another history move). Drop it and process the
    // real event.
    suppressPopstateRef.current = [];
  }

  // Leaving the current page via history buttons must save its scroll too —
  // loadLocation skips capture on the popstate path by design.
  captureScroll(snapshot().location);
  const { pathname, search, state } = env.currentLocation();
  const location = { pathname, search, state };
  if (
    blockerStateStore.getState() === "blocked" ||
    blockerStateStore.getState() === "charged"
  ) {
    if (blockerStateStore.getState() === "charged") {
      blockerStateStore.setState("blocked");
      blockedTargetStore.setState(location);
    }
    suppressPopstateRef.current.push(
      `${snapshot().location.pathname}${snapshot().location.search}`,
    );
    env.forward();
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
  routesRef.current = withInheritedExternalCache(root);
  if (size) routerConfig.maxCacheSize = size;
};

/** `externalCache` is declared on a section route and applies to everything
 * below it (a child can opt out with an explicit `false`). Resolved once at
 * registration: nodes without their own value get a shallow-copied options
 * object carrying the ancestor's value, so cache reads never walk the tree. */
export const withInheritedExternalCache = (
  node: RouteNode,
  inherited?: boolean,
): RouteNode => {
  const own = node.options.externalCache;
  const effective = own ?? inherited;
  const options =
    own === undefined && inherited !== undefined
      ? { ...node.options, externalCache: inherited }
      : node.options;
  const children = node.children?.map((child) => withInheritedExternalCache(child, effective));
  const unchanged =
    options === node.options &&
    (!children || children.every((child, i) => child === node.children![i]));
  if (unchanged) return node;
  return { ...node, options, children };
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
  suppressPopstateRef.current = [];
  routesRef.current = undefined;
  navigationSeqRef.current++;
  committedLocationRef.current = undefined;
  snapshotRef.current = {
    location: initialLocation(),
    status: "idle",
    matches: [],
    data: new Map(),
    // Own copy: aliasing the live `routeErrors` map would let later `errors.set()`
    // mutate the reset snapshot without `updateSnapshot`/emit.
    errors: new Map(),
  };
  dataStore.setState(new Map());
  stopPolling();
};
export const setupRevalidation = () => {
  const env = getRouterEnv();
  const focusHandler = () => {
    if (env.isVisible() && routerConfig.revalidateOnFocus)
      void invalidate(undefined, { staleOnly: true });
  };
  const onlineHandler = () => {
    if (routerConfig.revalidateOnReconnect)
      void invalidate(undefined, { staleOnly: true });
  };
  const offVisibility = env.onVisibilityChange(focusHandler);
  const offOnline = env.onOnline(onlineHandler);
  return () => {
    offVisibility();
    offOnline();
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
  getRouterEnv().replace(
    `${location.pathname}${location.search}`,
    location.state,
  );
  // A search-only replace is a committed navigation: the next real navigation
  // must see it as its `prevLocation`, not the pre-replace URL.
  committedLocationRef.current = location;
  // Keep the data rendered for the active matches: a search-only update must not
  // blank the page until the next invalidation refetches with the new search.
  const data = new Map(dataStore.getState());
  if (
    `${previousLocation.pathname}${previousLocation.search}` !==
    `${location.pathname}${location.search}`
  ) {
    for (const match of snapshot().matches) {
      const oldKey = routeKey(match.route, previousLocation);
      const newKey = routeKey(match.route, location);
      if (oldKey === newKey || !data.has(oldKey)) continue;
      data.set(newKey, data.get(oldKey));
      data.delete(oldKey);
    }
  }
  dataStore.setState(data);
  updateSnapshot((previous) => ({ ...previous, location, data }));
  // The URL changed under the active matches: re-arm polling for the new
  // location (the old timer would no-op-forever on its stale URL check) and
  // orphan the old cache keys so GC/evict can reclaim them.
  const matches = snapshot().matches;
  schedulePolling(matches, location);
  scheduleGc(matches, location);
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
