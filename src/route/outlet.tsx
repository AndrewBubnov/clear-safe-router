import { Suspense, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { RouteNode } from '../types';
import { restoreScrollNow, useRouterSnapshot } from '../runtime';
import { dataStore } from '../runtime/state';
import { routeKey } from '../runtime/state';
import { DefaultsContext, MatchIndex } from './context';
import { resolveComponent } from './lazy';

export const Outlet = () => {
  const index = useContext(MatchIndex);
  const state = useRouterSnapshot();
  // Outside the rendered route tree there is nothing to render below the leaf.
  const next = index === null ? state.matches.length : index + 1;
  return next < state.matches.length ? <RouteOutlet index={next} /> : null;
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
  const matchesLength = state.matches.length;
  // Element identity is kept stable across data-only updates (e.g. polling ticks) so the
  // rendered subtree is not re-rendered as a side effect of this route's data subscription.
  const content: ReactNode = useMemo(() => {
    if (error) {
      const ErrorView = resolveComponent(route.options.errorFallback) ?? resolveComponent(defaults.errorFallback);
      return ErrorView ? <Suspense fallback={pendingNode}><ErrorView error={error} /></Suspense> : <p role="alert">{error.message}</p>;
    }
    if (pending) return pendingNode;
    const Component = resolveComponent(route.options.component);
    return Component ? <Suspense fallback={pendingNode}><Component /></Suspense> : index < matchesLength - 1 ? <Outlet /> : null;
  }, [route, error, pending, pendingNode, defaults, index, matchesLength]);
  const Layout = route.options.layout;
  const body = (
    <MatchIndex.Provider value={index}>
      <ScrollRestore route={route as RouteNode} />
      {/* The layout renders inside the depth provider so hooks declared on it
          (e.g. `useParams` in a shared layout) resolve to THIS route's level. */}
      {Layout ? <Layout>{content}</Layout> : content}
    </MatchIndex.Provider>
  );
  return body;
};
