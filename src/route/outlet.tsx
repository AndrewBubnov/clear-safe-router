import { Suspense, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { RouteNode } from '../types';
import { restoreScrollNow, useRouterSnapshot } from '../runtime';
import { dataStore } from '../runtime/state';
import { routeKey } from '../runtime/state';
import { DefaultsContext, MatchIndex } from './context';
import { resolveComponent } from './lazy';

export const Outlet = () => {
  const index = useContext(MatchIndex);
  const state = useRouterSnapshot();
  return index + 1 < state.matches.length ? <RouteOutlet index={index + 1} /> : null;
};

/** Restores saved scroll positions after this route's DOM is mounted — earlier it races React's commit. */
const ScrollRestore = ({ route }: { route: { options: { scrollRestoration?: boolean | string[] } } }) => {
  useEffect(() => {
    if (route.options.scrollRestoration) restoreScrollNow();
  }, [route]);
  return null;
};

export const RouteOutlet = ({ index }: { index: number }) => {
  const state = useRouterSnapshot();
  const match = state.matches[index];
  if (!match) return null;
  const { route } = match;
  const dataKey = routeKey(route, state.location);
  const dataForRoute = useSyncExternalStore(dataStore.subscribe, () => dataStore.getState().get(dataKey), () => dataStore.getState().get(dataKey));
  const defaults = useContext(DefaultsContext);
  const error = state.errors.get(route.id);
  const loading = state.status === 'pending' || state.status === 'optimistic';
  const pending = loading && !!route.options.loader && dataForRoute === undefined;
  const pendingNode = route.options.pendingFallback ?? defaults.pendingFallback ?? null;
  let content: ReactNode = null;
  if (error) {
    const ErrorView = resolveComponent(route.options.errorFallback) ?? resolveComponent(defaults.errorFallback);
    content = ErrorView ? <Suspense fallback={pendingNode}><ErrorView error={error} /></Suspense> : <p role="alert">{error.message}</p>;
  } else if (pending) {
    content = pendingNode;
  } else {
    const Component = resolveComponent(route.options.component);
    content = Component ? <Suspense fallback={pendingNode}><Component /></Suspense> : index < state.matches.length - 1 ? <Outlet /> : null;
  }
  const body = (
    <MatchIndex.Provider value={index}>
      <ScrollRestore route={route as RouteNode} />
      {content}
    </MatchIndex.Provider>
  );
  const Layout = route.options.layout;
  return Layout ? <Layout>{body}</Layout> : body;
};
