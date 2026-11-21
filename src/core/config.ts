import type {
  DefaultPrefetch,
  Retry,
  RouteLogicOptions,
  RouteMatch,
  RouteNode,
  ScrollRestorationBehavior,
} from "./types";

export const routerConfig = {
  isAnimated: false,
  animationDuration: undefined as number | undefined,
  defaultStaleTime: undefined as number | undefined,
  /** `externalCache` fallback for routes that don't declare it. With `true` the
   * router cache never claims freshness (loader re-runs on every navigation);
   * an explicit route value still wins. */
  defaultExternalCache: undefined as boolean | undefined,
  defaultRetry: undefined as Retry | undefined,
  defaultPrefetch: "hover" as DefaultPrefetch,
  defaultHoverPrefetchDelay: 150,
  defaultMinLoaderDuration: 0,
  maxCacheSize: 100,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  enableCacheSnapshot: false,
  defaultScrollRestorationBehavior: "auto" as ScrollRestorationBehavior,
  /** Unmatched-route dev warning. The core never detects dev itself; the host
   * (or the React adapter) turns this on in its own dev builds. */
  warnOnUnmatchedRoutes: false as boolean,
  /** Adapter hook: the core reports prefetches; the view layer warms its own
   * code-split chunks (the core does not know about components). */
  onPrefetch: undefined as ((matches: RouteMatch[]) => void) | undefined,
  defaultBeforeLoad: undefined as RouteNode["options"]["beforeLoad"],
  defaultAfterLoad: undefined as RouteNode["options"]["afterLoad"],
};
export const configureRouter = (partial: Partial<typeof routerConfig>) =>
  Object.assign(routerConfig, partial);
export type BeforeLoadHook = NonNullable<RouteLogicOptions["beforeLoad"]>;
export type AfterLoadHook = NonNullable<RouteLogicOptions["afterLoad"]>;
