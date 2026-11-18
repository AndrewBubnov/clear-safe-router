import { useSyncExternalStore } from 'react';
import type { RouterSnapshot } from '../types';
import { blockerStateStore, blockedTargetStore, cacheSnapshotStore, contextStore, dataStore, loaderErrors, beforeLoadErrors, routeKey, snapshot, listeners } from '../core/state';

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot();
// The runtime object IS the adapter's snapshot (routes carry view fields and
// hook methods); the core types it with its narrower RouteNode, so the adapter
// narrows once here and every component reads typed matches without casts.
export const useRouterSnapshot = (): RouterSnapshot => useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as RouterSnapshot;

export const useRouteData = (id: string) => {
  const state = useRouterSnapshot();
  const match = state.matches.find(item => item.route.id === id);
  const key = match ? routeKey(match.route, state.location) : '';
  // Selector subscription: re-renders only when THIS route's data value changes,
  // so polling ticks on other routes/keys stay invisible here.
  const data = useSyncExternalStore(dataStore.subscribe, () => (key ? dataStore.getState().get(key) : undefined), () => (key ? dataStore.getState().get(key) : undefined));
  return {
    params: match?.params ?? {},
    search: Object.fromEntries(new URLSearchParams(state.location.search)),
    data,
    status: state.status,
    error: state.errors.get(id),
    loaderError: match ? loaderErrors.get(id) ?? null : null,
    beforeLoadError: match ? beforeLoadErrors.get(id) ?? null : null,
  };
};
/**
 * Link subscriptions are selector-based: the snapshot is reduced to its
 * `isActive`/`isPending` flags so navigation re-renders only the links whose
 * state actually flips (parity with the original clear-router Link).
 */
export const useLinkState = (pathname: string, search: string, exact: boolean) => {
  const select = () => {
    const state = snapshot();
    const current = `${state.location.pathname}${state.location.search}`;
    const target = `${pathname}${search}`;
    const active = search === ''
      ? exact
        ? state.location.pathname === pathname
        : pathname === '/'
          ? state.location.pathname === '/'
          : state.location.pathname === pathname || state.location.pathname.startsWith(`${pathname}/`)
      : current === target;
    const pending = current === target && state.status === 'pending';
    return `${active ? 1 : 0}${pending ? 1 : 0}`;
  };
  const flags = useSyncExternalStore(subscribe, select, select);
  return { isActive: flags[0] === '1', isPending: flags[1] === '1' };
};
export const useRouterContext = () => {
  const context = useSyncExternalStore(contextStore.subscribe, contextStore.getState, contextStore.getState);
  return { context, setContext: contextStore.setState };
};
export const mergeContext = (value: Record<string, unknown>) => contextStore.setState(previous => ({ ...previous, ...value }));
export const useCacheSnapshotValue = () => useSyncExternalStore(cacheSnapshotStore.subscribe, cacheSnapshotStore.getState, cacheSnapshotStore.getState);
export const useBlockerStateValue = () => useSyncExternalStore(blockerStateStore.subscribe, blockerStateStore.getState, blockerStateStore.getState);
export const useBlockedTargetValue = () => useSyncExternalStore(blockedTargetStore.subscribe, blockedTargetStore.getState, blockedTargetStore.getState);
