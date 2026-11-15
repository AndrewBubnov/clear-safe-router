import { create } from "../create";
import { WINDOW_TOP, WINDOW_LEFT } from "../constants";
import { splitPath } from "./match";
import type {
  BlockerState,
  CacheReason,
  CacheSnapshotEntry,
  RouteMatch,
  RouteNode,
  RouterLocation,
  RouterSnapshot,
} from "../types";

export type CacheEntry = {
  value: unknown;
  updatedAt: number;
  staleTime: number;
  gcTime?: number;
  gcExpiresAt?: number;
  lastUsed: number;
  reason?: CacheReason;
  prefetchedUntil?: number;
  timer?: ReturnType<typeof setTimeout>;
};
export type Flight = {
  controller: AbortController;
  signal: AbortSignal;
  token: object;
  promise: Promise<unknown>;
};

// ——— immutable-per-navigation refs ———
export const routesRef: { current: RouteNode | undefined } = {
  current: undefined,
};
export const snapshotRef: { current: RouterSnapshot } = {
  current: {
    location: { pathname: "/", search: "" },
    status: "idle",
    matches: [],
    data: new Map(),
    errors: new Map(),
  },
};
export const navigationSeqRef: { current: number } = { current: 0 };
/** Last successfully committed location — unlike `snapshot().location`, which is
 * overwritten with the target URL during the pending phase, so guard redirects
 * can still see where the navigation actually came from. */
export const committedLocationRef: { current: RouterLocation | undefined } = { current: undefined };
export const activeControllerRef: { current: AbortController | undefined } = {
  current: undefined,
};
/** When a popstate is reverted with history.forward() (blocker), this holds the
 * URL the revert should land on. Only a popstate landing on exactly that URL is
 * swallowed — a real user navigation in between is processed normally. */
export const suppressPopstateRef: { current: string | null } = { current: null };

// ——— subscriptions ———
export const listeners = new Set<() => void>();

// ——— stores ———
export const contextStore = create<Record<string, unknown>>({});
export const blockerStateStore = create<BlockerState>("unblocked");
export const blockedTargetStore = create<RouterLocation | null>(null);
export const cacheSnapshotStore = create<CacheSnapshotEntry[]>([]);
/** Render-scope loader data, keyed the same as the cache: `routeId|url`. Kept separate from
 * the navigation snapshot so polling ticks re-render only data subscribers. */
export const dataStore = create<Map<string, unknown>>(new Map());

// ——— loader cache ———
export const cache = new Map<string, CacheEntry>();
export const flights = new Map<string, Flight>();
export const loaderErrors = new Map<string, Error>();
export const beforeLoadErrors = new Map<string, Error>();
export const routeErrors = new Map<string, Error>();

// ——— scroll restoration ———
export const scrollMap = new Map<string, [string, number][]>();
export const WINDOW_KEYS = { top: WINDOW_TOP, left: WINDOW_LEFT };

export const initialLocation = (): RouterLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
  state: window.history.state,
});
export const setSnapshot = (next: RouterSnapshot) => {
  snapshotRef.current = next;
};
export const updateSnapshot = (
  mutate: (previous: RouterSnapshot) => RouterSnapshot,
) => {
  snapshotRef.current = mutate(snapshotRef.current);
};
/**
 * Cache key for a route's loader data: `routeId|ownPath+search`.
 * `ownPath` is the part of the URL the route's own pattern consumes — the first N
 * segments of the pathname (the whole pathname for the wildcard catch-all). A parent
 * route therefore shares one cache entry across all deeper URLs: navigating to a
 * sibling child never refetches the parent's loader, and search stays part of the
 * key because loaders receive it.
 */
export const routeKey = (route: RouteNode, location: RouterLocation) => {
  const actual = splitPath(location.pathname);
  const own = route.path.endsWith("*") ? actual : actual.slice(0, splitPath(route.path).length);
  return `${route.id}|/${own.join("/")}${location.search}`;
};
export const snapshot = () => snapshotRef.current;
export type { RouteMatch };
