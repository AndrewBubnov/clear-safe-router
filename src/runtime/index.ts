import type { BlockerState, RouterRuntime } from "../types";
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
} from "./actions";
import { restoreScrollNow } from "./scroll";
import { blockedTargetStore, blockerStateStore } from "./state";
import { emit as emitSnapshot, syncCacheSnapshot } from "./cache";
import { resolveTarget } from "./match";
import { configureRouter, routerConfig } from "./config";
import {
  useRouteData,
  useRouterSnapshot,
  useRouterContext,
  mergeContext,
  useCacheSnapshotValue,
  useLoaderStateValue,
  useBlockerStateValue,
  useBlockedTargetValue,
  useLinkState,
} from "./hooks";

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
  useLoaderStateValue,
  useBlockerStateValue,
  useBlockedTargetValue,
};
