import { Suspense, useContext, useLayoutEffect, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { restoreScrollNow, useRouterSnapshot } from '../runtime';
import { dataStore } from '../core/state';
import { routeKey } from '../core/state';
import { snapshot } from '../core/state';
import { LAZY_MARKER } from '../core/constants';
import { routerConfig } from '../core/config';
import { DefaultsContext, MatchIndex } from './context';
import { resolveComponent } from './lazy';
import type { RouterSnapshot } from '../core/types';

/** Route ids whose RouteOutlet is currently mounted — the hidden-children dev
 * check compares the matched chain against this set. */
export const mountedOutlets = new Set<string>();
const warnedHiddenChildren = new Set<string>();

/** Dev check for a matched parent whose component never rendered `<Outlet />`:
 * everything below it silently disappears. Runs one macrotask after the
 * snapshot settles (child effects have registered by then), warns once per
 * child route id. Known-benign cases are skipped: a parent in the error map
 * legitimately replaces its subtree, and a lazy parent may still be resolving
 * its chunk while its fallback is on screen. */
export const reportHiddenChildren = (state: RouterSnapshot) => {
  if (!routerConfig.warnOnHiddenChildren) return;
  if (state.status !== 'active' || state.matches.length < 2) return;
  setTimeout(() => {
    // The verdict is about this commit: a newer snapshot means the chain moved
    // on and its own effect run will check instead.
    if (snapshot() !== state) return;
    for (let index = 1; index < state.matches.length; index++) {
      const match = state.matches[index]!;
      const parent = state.matches[index - 1]!;
      if (mountedOutlets.has(match.route.id)) continue;
      if (state.errors.has(parent.route.id)) continue;
      const parentComponent: unknown = parent.route.options.component;
      if (
        parentComponent &&
        typeof parentComponent === 'object' &&
        LAZY_MARKER in (parentComponent as object)
      )
        continue;
      if (warnedHiddenChildren.has(match.route.id)) continue;
      warnedHiddenChildren.add(match.route.id);
      console.warn(
        `[clear-safe-router] Route "${parent.route.id}" does not render <Outlet /> at ${state.location.pathname}${state.location.search} — child route "${match.route.id}" is not rendered. Render <Outlet /> inside its component, or remove the component to let the router render children automatically.`,
      );
    }
  }, 0);
};

export const Outlet = () => {
  const index = useContext(MatchIndex);
  const state = useRouterSnapshot();
  // Outside the rendered route tree there is nothing to render below the leaf.
  const next = index === null ? state.matches.length : index + 1;
  return next < state.matches.length ? <RouteOutlet index={next} /> : null;
};
/** Restores saved scroll positions after this route's DOM is mounted — earlier it races React's commit.
 * The effect also re-runs when the route's own cache key changes (same route object, different
 * params, e.g. /item/1 → /item/2), otherwise the restore would fire only once per mount. */
const ScrollRestore = ({ route, restoreKey }: { route: { options: { scrollRestoration?: boolean | string[] } }; restoreKey: string }) => {
  // Layout effect: restoring after a passive effect paints the old position
  // first — a visible jump. Before commit there is no DOM to scroll yet.
  useLayoutEffect(() => {
    if (route.options.scrollRestoration) restoreScrollNow({ resetIfUnsaved: true });
  }, [route, restoreKey]);
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
  // The hidden-children dev check reads this registration after commit: an
  // Outlet that never mounts for a matched child route is the warning signal.
  useEffect(() => {
    mountedOutlets.add(route.id);
    return () => {
      mountedOutlets.delete(route.id);
    };
  }, [route]);
  const body = (
    <MatchIndex.Provider value={index}>
      <ScrollRestore route={route} restoreKey={dataKey} />
      {/* The layout renders inside the depth provider so hooks declared on it
          (e.g. `useParams` in a shared layout) resolve to THIS route's level. */}
      {Layout ? <Layout>{content}</Layout> : content}
    </MatchIndex.Provider>
  );
  return body;
};
