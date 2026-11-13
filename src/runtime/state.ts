import { create } from '../create';
import { WINDOW_TOP, WINDOW_LEFT } from '../constants';
import type { BlockerState, CacheReason, CacheSnapshotEntry, LoaderState, RouteMatch, RouteNode, RouterLocation, RouterSnapshot } from '../types';

export type LoaderStateView = LoaderState;
export type ScrollRestorationOption = boolean | string[];
export type RedirectTarget = string | { pathname: string; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown };
export type CacheEntry = { value: unknown; updatedAt: number; staleTime: number; gcTime?: number; gcExpiresAt?: number; lastUsed: number; reason?: CacheReason; prefetchedUntil?: number; timer?: ReturnType<typeof setTimeout> };
export type Flight = { controller: AbortController; signal: AbortSignal; token: object; promise: Promise<unknown> };
export type InvalidateResult = { path: string; data: unknown; error: Error | null };

// ——— immutable-per-navigation refs ———
export const routesRef: { current: RouteNode | undefined } = { current: undefined };
export const snapshotRef: { current: RouterSnapshot } = { current: { location: { pathname: '/', search: '' }, status: 'idle', matches: [], data: new Map(), errors: new Map() } };
export const navigationSeqRef: { current: number } = { current: 0 };
export const activeControllerRef: { current: AbortController | undefined } = { current: undefined };
export const suppressPopstateRef: { current: boolean } = { current: false };

// ——— subscriptions ———
export const listeners = new Set<() => void>();

// ——— stores ———
export const contextStore = create<Record<string, unknown>>({});
export const blockerStateStore = create<BlockerState>('unblocked');
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
export const errorMaps = { loader: loaderErrors, beforeLoad: beforeLoadErrors };

// ——— scroll restoration ———
export const scrollMap = new Map<string, [string, number][]>();
export const WINDOW_KEYS = { top: WINDOW_TOP, left: WINDOW_LEFT };

export const initialLocation = (): RouterLocation => ({ pathname: window.location.pathname, search: window.location.search, state: window.history.state });
export const getRoutes = () => routesRef.current;
export const getSnapshot = () => snapshotRef.current;
export const setSnapshot = (next: RouterSnapshot) => { snapshotRef.current = next; };
export const updateSnapshot = (mutate: (previous: RouterSnapshot) => RouterSnapshot) => { snapshotRef.current = mutate(snapshotRef.current); };
export const routeKey = (route: RouteNode, location: RouterLocation) => `${route.id}|${location.pathname}${location.search}`;
export const snapshot = () => snapshotRef.current;
export type { RouteMatch };
