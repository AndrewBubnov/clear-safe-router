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
  setRouterConfig(routes, maxCacheSize);
  configureRouter({
    isAnimated,
    animationDuration,
    defaultRetry,
    defaultStaleTime,
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
  useEffect(() => {
    if (enableCacheSnapshot) syncCacheSnapshot();
  }, [enableCacheSnapshot]);
  useEffect(() => {
    if (context) mergeContext(context);
    const onPopState = () => {
      void handlePopState();
    };
    window.addEventListener("popstate", onPopState);
    const stopRevalidation = setupRevalidation();
    void routerRuntime.navigate(
      `${window.location.pathname}${window.location.search}`,
    );
    return () => {
      window.removeEventListener("popstate", onPopState);
      stopRevalidation();
      stopPolling();
    };
  }, [routes, maxCacheSize]);
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
