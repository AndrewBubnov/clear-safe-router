/**
 * Framework-free kernel barrel — the STABLE public surface of the
 * `clear-safe-router/core` subpath. Curated on purpose: raw internals
 * (cache/flights maps, refs, the listener set) stay module-internal so they
 * can evolve without breaking adapter consumers. In-package code may use
 * deep module paths; external code should stick to this barrel.
 */
export * from './types';
export { setRouterEnv, getRouterEnv, nullEnv, type RouterEnv, type EnvScrollElement, type EnvScrollOptions, type ScrollBehaviorName } from './env';
export {
  routerConfig,
  configureRouter,
  type BeforeLoadHook,
  type AfterLoadHook,
} from './config';
export {
  matchRoutes,
  interpolate,
  formatSearch,
  resolveTarget,
  splitLocation,
  isSameLocation,
} from './match';
export {
  snapshot,
  routeKey,
  contextStore,
  blockerStateStore,
  blockedTargetStore,
  cacheSnapshotStore,
  dataStore,
  subscribe,
  initialLocation,
} from './state';
export {
  syncCacheSnapshot,
} from './cache';
export {
  commit,
  loadLocation,
  stopPolling,
} from './navigate';
export {
  navigate,
  invalidate,
  prefetch,
  handlePopState,
  processBlockedTarget,
  setRouterConfig,
  resetRouterState,
  setupRevalidation,
  updateSearchParams,
  submitRouteAction,
} from './actions';
export { captureScroll, applyScrollRestoration, restoreScrollNow } from './scroll';
