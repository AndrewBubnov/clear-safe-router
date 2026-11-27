/**
 * Runtime barrel for the React adapter. The framework-free kernel lives in
 * `../core`; everything here is the React glue (hooks) plus re-exports of the
 * core's public surface for the top-level `index.tsx`.
 */
import type { BlockerState, RouterRuntime } from "../core/types";
import {
  handlePopState,
  processBlockedTarget,
  setRouterConfig,
  resetRouterState,
  setupRevalidation,
  submitRouteAction,
  updateSearchParams,
  navigate,
  invalidate,
  prefetch,
} from "../core/actions";
import { restoreScrollNow } from "../core/scroll";
import { stopPolling } from "../core/navigate";
import { blockedTargetStore, blockerStateStore } from "../core/state";
import { emit as emitSnapshot, syncCacheSnapshot } from "../core/cache";
import { resolveTarget } from "../core/match";
import { configureRouter, routerConfig } from "../core/config";
import {
  useRouteData,
  useRouterSnapshot,
  useRouterContext,
  mergeContext,
  useCacheSnapshotValue,
  useBlockerStateValue,
  useBlockedTargetValue,
  useLinkState,
} from "./hooks";
import { browserEnv } from "../browser-env";
import { setRouterEnv, getRouterEnv, nullEnv } from "../core/env";
import { LAZY_MARKER } from "../core/constants";
import type { LazyModule } from "../core/types";
import type { RouteMatch } from "../core/types";

// The adapter wires the browser platform exactly once and only when no host
// env is already installed: importing utilities must not clobber an env that
// a headless host (or a test) configured before importing this barrel.
// A DOM is required — `browserEnv` reads both `window` and `document`.
if (
  getRouterEnv() === nullEnv &&
  typeof window !== "undefined" &&
  typeof document !== "undefined"
)
  setRouterEnv(browserEnv);

// Pure config wiring, not environment detection: the adapter prefetch hook
// must be present before any Link/prefetch call, including tests that drive
// `routerRuntime.prefetch` without rendering `<Router>`.
const warmLazyChunks = ((matches: RouteMatch[]) => {
  const leafComponent = (matches.at(-1)?.route.options as { component?: unknown }).component;
  if (leafComponent && typeof leafComponent === 'object' && LAZY_MARKER in leafComponent)
    void (leafComponent as LazyModule).importFn();
}) as ((matches: RouteMatch[]) => void) & { __warmsLazyChunks?: true };
warmLazyChunks.__warmsLazyChunks = true;
// Chain instead of assign: a host that configured its own `onPrefetch` before
// importing the adapter keeps it. The marker makes a module re-evaluation
// (HMR) idempotent instead of stacking the hook.
const existingOnPrefetch = routerConfig.onPrefetch as typeof warmLazyChunks | undefined;
if (existingOnPrefetch?.__warmsLazyChunks) {
  // already wired
} else if (existingOnPrefetch) {
  const hostHook = existingOnPrefetch;
  routerConfig.onPrefetch = (matches) => {
    hostHook(matches);
    warmLazyChunks(matches);
  };
} else {
  routerConfig.onPrefetch = warmLazyChunks;
}
// The dev signal is an adapter concern: the core stays Vite-free, the adapter
// reads the bundler flag in its own module scope.
const isDevBuild = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
routerConfig.warnOnUnmatchedRoutes = isDevBuild;
routerConfig.warnOnHiddenChildren = isDevBuild;

export const routerRuntime: RouterRuntime = { navigate, invalidate, prefetch };
export const setBlockerStatus = (state: BlockerState) =>
  blockerStateStore.setState(state);
export const getBlockedTarget = () => blockedTargetStore.getState();
export const resetBlockedTarget = () => {
  blockedTargetStore.setState(null);
  emitSnapshot();
};
export {
  configureRouter,
  routerConfig,
  handlePopState,
  processBlockedTarget,
  setRouterConfig,
  resetRouterState,
  setupRevalidation,
  submitRouteAction,
  updateSearchParams,
  restoreScrollNow,
  stopPolling,
  resolveTarget,
  syncCacheSnapshot,
  navigate,
  invalidate,
  prefetch,
};
export {
  useRouteData,
  useRouterSnapshot,
  useRouterContext,
  useLinkState,
  mergeContext,
  useCacheSnapshotValue,
  useBlockerStateValue,
  useBlockedTargetValue,
};
