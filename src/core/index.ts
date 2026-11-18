/**
 * Framework-free kernel barrel: matching, caching, navigation state machine,
 * guards, polling, actions and the platform seam. Zero `react` imports —
 * a non-DOM host can drive this with `setRouterEnv`.
 */
export * from './types';
export * from './env';
export { create, useGlobalState, type Store } from './create';
export { LAZY_MARKER, STANDARD_PREFETCH_DELAY } from './constants';
export {
  routerConfig,
  configureRouter,
  type BeforeLoadHook,
  type AfterLoadHook,
} from './config';
export {
  matchRoutes,
  matchSegments,
  splitPath,
  splitLocation,
  splitUrl,
  formatSearch,
  interpolate,
  resolveTarget,
  matchesPath,
  isParamSegment,
  isSameLocation,
  isVerticalScroll,
  normalizeSearch,
  parseCacheKey,
  sleep,
  toError,
} from './match';
export {
  routesRef,
  snapshotRef,
  navigationSeqRef,
  committedLocationRef,
  activeControllerRef,
  suppressPopstateRef,
  listeners,
  contextStore,
  blockerStateStore,
  blockedTargetStore,
  cacheSnapshotStore,
  dataStore,
  cache,
  flights,
  loaderErrors,
  beforeLoadErrors,
  routeErrors,
  scrollMap,
  WINDOW_KEYS,
  initialLocation,
  routeKey,
  snapshot,
  setSnapshot,
  updateSnapshot,
  type CacheEntry,
  type Flight,
} from './state';
export {
  emit,
  isCacheFresh,
  runLoader,
  scheduleGc,
  clearCacheAndFlights,
  syncCacheSnapshot,
} from './cache';
export {
  commit,
  loadLocation,
  guardsAllowPrefetch,
  schedulePolling,
  stopPolling,
  RedirectSignal,
  REDIRECT_LIMIT,
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
