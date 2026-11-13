import { useSyncExternalStore } from 'react';
import { blockerStateStore, blockedTargetStore, cacheSnapshotStore, contextStore, dataStore, loaderErrors, beforeLoadErrors, routeKey, snapshot, listeners } from './state';
import type { LoaderState } from '../types';

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot();
export const useRouterSnapshot = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
export const useRouteData = (id: string) => {
  const state = useRouterSnapshot();
  const match = state.matches.find(item => item.route.id === id);
  const key = match ? routeKey(match.route, state.location) : '';
  // Selector subscription: re-renders only when THIS route's data value changes,
  // so polling ticks on other routes/keys stay invisible here.
  const data = useSyncExternalStore(dataStore.subscribe, () => (key ? dataStore.getState().get(key) : undefined), () => (key ? dataStore.getState().get(key) : undefined));
  return { params: match?.params ?? {}, search: Object.fromEntries(new URLSearchParams(state.location.search)), data, status: state.status, error: state.errors.get(id) };
};
export const useRouterContext = () => {
  const context = useSyncExternalStore(contextStore.subscribe, contextStore.getState, contextStore.getState);
  return { context, setContext: contextStore.setState };
};
export const mergeContext = (value: Record<string, unknown>) => contextStore.setState(previous => ({ ...previous, ...value }));
export const useCacheSnapshotValue = () => useSyncExternalStore(cacheSnapshotStore.subscribe, cacheSnapshotStore.getState, cacheSnapshotStore.getState);
export const useLoaderStateValue = (): LoaderState => {
  const state = useRouterSnapshot();
  const leaf = state.matches.at(-1);
  const key = leaf ? routeKey(leaf.route, state.location) : '';
  const data = useSyncExternalStore(dataStore.subscribe, () => (key ? dataStore.getState().get(key) : undefined), () => (key ? dataStore.getState().get(key) : undefined));
  return { data, loaderError: leaf ? loaderErrors.get(leaf.route.id) ?? null : null, beforeLoadError: leaf ? beforeLoadErrors.get(leaf.route.id) ?? null : null };
};
export const useBlockerStateValue = () => useSyncExternalStore(blockerStateStore.subscribe, blockerStateStore.getState, blockerStateStore.getState);
export const useBlockedTargetValue = () => useSyncExternalStore(blockedTargetStore.subscribe, blockedTargetStore.getState, blockedTargetStore.getState);
