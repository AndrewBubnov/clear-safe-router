/**
 * Framework-free core types: locations, matching, caching, loaders, guards and
 * the imperative runtime API. Everything React-shaped (component, layout,
 * fallbacks, Link element props) lives in the adapter's `../types.ts`, which
 * extends `RouteLogicOptions` with view fields.
 */
import { LAZY_MARKER } from './constants';

/**
 * App-owned registry of route IDs. The router library never lists routes itself:
 * the app's generated route tree augments this interface, and every typed API
 * (Link `to`, `Route.useParams`, `Route.useLoaderData`, ...) derives its
 * literals from `keyof TypedRouterRouteMap`.
 */
export interface TypedRouterRouteMap {}

export type SetStateFn<T> = {
  (action: T): void;
  (action: (prevState: T) => T): void;
};
export type Synchronizer = <T>(subscribe: (updater: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T) => T;

export type RouteId = keyof TypedRouterRouteMap extends never ? string : keyof TypedRouterRouteMap & string;

export type BlockerState = 'blocked' | 'unblocked' | 'charged';
export type SearchParams = Record<string, string>;
export type RouteStatus = 'idle' | 'pending' | 'active' | 'optimistic' | 'error';
export type Retry = number | { count: number; delay: number };
export type RouterLocation = { pathname: string; search: string; state?: unknown; key?: string; prevLocation?: { pathname: string; search: string } };
export type LoaderArgs<P extends Record<string, string> = Record<string, string>> = {
  params: P;
  search: SearchParams;
  context: Record<string, unknown>;
  signal: AbortSignal;
  attempt: number;
  location: RouterLocation;
};
export type RedirectTarget = string | { pathname: string; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown };
export type RouteHookArgs<P extends Record<string, string> = Record<string, string>> = Omit<LoaderArgs<P>, 'signal' | 'attempt'> & {
  redirect(to: RedirectTarget): Promise<void>;
  setContext(update: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>)): void;
};
/** Guard args: like RouteHookArgs but carries the navigation's abort signal —
 * superseded when the next navigation starts, so in-flight guard work (an API
 * call) can cancel itself. Actions intentionally stay signal-less: no
 * navigation lifecycle. Prefetch guards receive the prefetch attempt's own
 * signal (viewport leave / render teardown aborts it). */
export type BeforeLoadArgs<P extends Record<string, string> = Record<string, string>> = Omit<LoaderArgs<P>, 'attempt'> & {
  redirect(to: RedirectTarget): Promise<void>;
  setContext(update: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>)): void;
};
export type ScrollRestorationBehavior = 'auto' | 'smooth' | 'instant';
export type ScrollRestorationOption = boolean | string[];

/**
 * The data-and-behavior half of a route definition: loaders, guards, caching,
 * polling, scroll. View fields (component/layout/fallbacks) are added by the
 * adapter's `FileRouteOptions`; the core reads only this subset.
 */
export type RouteLogicOptions<P extends Record<string, string> = Record<string, string>> = {
  loader?: (args: LoaderArgs<P>) => unknown | Promise<unknown>;
  beforeLoad?: (args: BeforeLoadArgs<P>) => void | Promise<void>;
  afterLoad?: (args: Omit<RouteHookArgs<P>, 'redirect' | 'setContext'>) => void | Promise<void>;
  actions?: (args: Omit<RouteHookArgs<P>, 'redirect'>) => Record<string, (data: Record<string, unknown>) => unknown | Promise<unknown>>;
  staleTime?: number;
  /** Marks routes whose data is owned by an external cache (e.g. TanStack Query
   * passed via router context). The router cache then never claims freshness:
   * prefetch and navigation entries alike are always stale, so the loader
   * re-runs on every navigation and the external cache decides whether the
   * network is hit. Inherited by children; a child can opt out with `false`. */
  externalCache?: boolean;
  gcTime?: number;
  retry?: Retry;
  optimistic?: boolean;
  pollingInterval?: number;
  minLoaderDuration?: number;
  scrollRestoration?: ScrollRestorationOption;
  scrollRestorationBehavior?: ScrollRestorationBehavior;
};

/** Code-split marker shared with the generator and the adapter's `lazy()`. */
export type LazyModule = { readonly [LAZY_MARKER]: true; importFn: () => Promise<unknown> };

/** The core's view of a route node: identity, own path, children and logic options.
 * The index signature admits adapter view fields (component, layout, fallbacks)
 * without the core typing them. */
export type RouteNode = { id: string; options: RouteLogicOptions<any> & { [viewField: string]: unknown }; path: string; children: RouteNode[] };
/** Generic over the route node so the adapter can instantiate with its own
 * richer RouteNode (view fields + hooks) without casts at every call site. */
export type RouteMatch<R extends RouteNode = RouteNode> = { route: R; params: Record<string, string>; key: string };
export type LoaderState = { data: unknown; loaderError: Error | null; beforeLoadError: Error | null };
export type RouterSnapshot<R extends RouteNode = RouteNode> = { location: RouterLocation; status: RouteStatus; matches: RouteMatch<R>[]; data: Map<string, unknown>; errors: Map<string, Error> };

export type CacheReason = 'navigation' | 'prefetch' | 'invalidate' | 'polling';
export type CacheSnapshotEntry = {
  path: string;
  data: unknown;
  timestamp: number;
  staleTime: number | undefined;
  reason?: CacheReason;
  gcExpiresAt: number | undefined;
  gcDuration: number | undefined;
  isCached: boolean;
  isLoading: boolean;
};
export type CacheSnapshot = CacheSnapshotEntry[];
export type InvalidateResult = { path: string; data: unknown; error: Error | null };
export type InvalidateOptions = { withChildren?: boolean; force?: boolean; staleOnly?: boolean };

export type DefaultPrefetch = 'hover' | 'render' | 'viewport' | 'none' | 'auto';
export type NavigateOptions = { search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown; replace?: boolean };

type ParamForSegment<Segment extends string> = Segment extends '$' ? { _splat: string } : Segment extends `$${infer Name}` ? { [K in Name]: string } : Record<never, never>;
type ParamsFromSegments<Segments extends string> = Segments extends `${infer Head}/${infer Tail}` ? ParamForSegment<Head> & ParamsFromSegments<Tail> : ParamForSegment<Segments>;
export type ParamsFor<Id extends string> = ParamsFromSegments<Id extends `/${infer Rest}` ? Rest : Id>;
type NonRoot<Id> = Id extends '__root__' ? never : Id;
type StrictParams<Id extends RouteId> = keyof ParamsFor<Id> extends never ? { params?: never } : { params: ParamsFor<Id> };
export type TypedDestination<Id extends RouteId = NonRoot<RouteId>> = Id extends RouteId ? { to: Id } & StrictParams<Id> & NavigateOptions : never;

export type NavigateTarget = TypedDestination | string | -1 | ({ toRaw: string } & NavigateOptions);
export type RouterRuntime = {
  navigate(target: NavigateTarget): Promise<void>;
  invalidate(target?: string | string[] | { to: RouteId; params?: Record<string, string> }, options?: { withChildren?: boolean; staleOnly?: boolean; force?: boolean }): Promise<InvalidateResult[]>;
  prefetch(target: string | { to: RouteId; params?: Record<string, string> }, signal?: AbortSignal): Promise<void>;
};
