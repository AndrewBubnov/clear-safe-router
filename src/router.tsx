import { useEffect } from "react";
import { RouteMatchRoot, RouteOutlet } from "./route";
import {
  configureRouter,
  handlePopState,
  mergeContext,
  routerRuntime,
  setRouterConfig,
  setupRevalidation,
  syncCacheSnapshot,
  stopPolling,
  useRouterSnapshot,
} from "./runtime";
import type { RouterProps } from "./types";
import { getRouterEnv } from "./core/env";

export const Router = ({
  routes,
  notFound = <p>Not found</p>,
  pendingFallback,
  errorFallback,
  maxCacheSize,
  isAnimated = false,
  animationDuration,
  defaultRetry,
  defaultStaleTime,
  defaultExternalCache,
  defaultPrefetch = "hover",
  defaultHoverPrefetchDelay = 150,
  defaultMinLoaderDuration = 0,
  errorBoundary: ErrorBoundary,
  defaultBeforeLoad,
  defaultAfterLoad,
  defaultScrollRestorationBehavior = "auto",
  revalidateOnFocus = false,
  revalidateOnReconnect = false,
  context,
  enableCacheSnapshot = false,
}: RouterProps) => {
  const state = useRouterSnapshot();
  // Router configuration is applied in effects (never during render). The config
  // effect is declared before the navigation effect so routes are registered first.
  useEffect(() => {
    setRouterConfig(routes, maxCacheSize);
  }, [routes, maxCacheSize]);
  useEffect(() => {
    configureRouter({
      isAnimated,
      animationDuration,
      defaultRetry,
      defaultStaleTime,
      defaultExternalCache,
      defaultPrefetch,
      defaultHoverPrefetchDelay,
      defaultMinLoaderDuration,
      defaultBeforeLoad,
      defaultAfterLoad,
      defaultScrollRestorationBehavior,
      revalidateOnFocus,
      revalidateOnReconnect,
      enableCacheSnapshot,
    });
    // Only re-apply when a prop actually changes; running after every render
    // would overwrite host config (e.g. a `configureRouter` call made between
    // renders) with the same values for no reason.
  }, [
    isAnimated,
    animationDuration,
    defaultRetry,
    defaultStaleTime,
    defaultExternalCache,
    defaultPrefetch,
    defaultHoverPrefetchDelay,
    defaultMinLoaderDuration,
    defaultBeforeLoad,
    defaultAfterLoad,
    defaultScrollRestorationBehavior,
    revalidateOnFocus,
    revalidateOnReconnect,
    enableCacheSnapshot,
  ]);
  useEffect(() => {
    if (enableCacheSnapshot) syncCacheSnapshot();
  }, [enableCacheSnapshot]);
  useEffect(() => {
    if (context) mergeContext(context);
    const onPopState = () => {
      void handlePopState();
    };
    const env = getRouterEnv();
    const offPopState = env.onPopState(onPopState);
    const stopRevalidation = setupRevalidation();
    void routerRuntime.navigate(env.currentUrl());
    return () => {
      offPopState();
      stopRevalidation();
      stopPolling();
    };
  }, [routes, maxCacheSize]);
  // Re-merge when the context prop object changes after mount.
  useEffect(() => {
    if (context) mergeContext(context);
  }, [context]);
  if (state.matches.length === 0) {
    if (state.status === "idle" || state.status === "pending")
      return <>{pendingFallback ?? null}</>;
    if (state.status === "error" && errorFallback) {
      const error = state.errors.values().next().value;
      if (error) {
        const ErrorView = errorFallback;
        return <ErrorView error={error} />;
      }
    }
    return <>{notFound}</>;
  }
  const leaf = state.matches[state.matches.length - 1];
  if (
    state.matches.length === 1 &&
    leaf?.route.id === "__root__" &&
    state.status === "active"
  )
    return <>{notFound}</>;
  const tree = (
    <RouteMatchRoot defaults={{ pendingFallback, errorFallback }}>
      <RouteOutlet index={0} />
    </RouteMatchRoot>
  );
  return ErrorBoundary ? <ErrorBoundary>{tree}</ErrorBoundary> : tree;
};
