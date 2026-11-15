import type {
  DefaultPrefetch,
  Retry,
  RouteNode,
  ScrollRestorationBehavior,
  FileRouteOptions,
} from "../types";

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
  defaultBeforeLoad: undefined as RouteNode["options"]["beforeLoad"],
  defaultAfterLoad: undefined as RouteNode["options"]["afterLoad"],
};
export const configureRouter = (partial: Partial<typeof routerConfig>) =>
  Object.assign(routerConfig, partial);
export type BeforeLoadHook = NonNullable<FileRouteOptions["beforeLoad"]>;
export type AfterLoadHook = NonNullable<FileRouteOptions["afterLoad"]>;
