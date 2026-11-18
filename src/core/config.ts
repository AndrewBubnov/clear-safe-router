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
  defaultRetry: undefined as Retry | undefined,
  defaultPrefetch: "hover" as DefaultPrefetch,
  defaultHoverPrefetchDelay: 150,
  defaultMinLoaderDuration: 0,
  maxCacheSize: 100,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  enableCacheSnapshot: false,
  defaultScrollRestorationBehavior: "auto" as ScrollRestorationBehavior,
  /** Unmatched-route dev warning. `'auto'` (default) warns only when a dev
   * signal is detectable (e.g. Vite's `import.meta.env.DEV`); hosts without a
   * dev signal should set `true`/`false` explicitly. */
  warnOnUnmatchedRoutes: "auto" as "auto" | boolean,
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
