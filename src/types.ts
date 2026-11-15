import type { AnchorHTMLAttributes, ComponentType, CSSProperties, ReactElement, ReactNode, Ref } from 'react';
import { LAZY_MARKER } from './constants';

/**
 * App-owned registry of route IDs. The router library never lists routes itself:
 * the app's generated route tree augments this interface (via `declare module 'clear-safe-router'`),
 * and every typed API (Link `to`, `useParams`, `useLoaderData`, ...) derives its
 * literals from `keyof TypedRouterRouteMap`.
 */
export interface TypedRouterRouteMap {}

export type LazyComponent = { readonly [LAZY_MARKER]: true; importFn: () => Promise<{ default: ComponentType }> };
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
export type ScrollRestorationBehavior = 'auto' | 'smooth' | 'instant';
export type ScrollRestorationOption = boolean | string[];
export type FileRouteOptions<P extends Record<string, string> = Record<string, string>> = {
  component?: ComponentType | LazyComponent;
  layout?: ComponentType<{ children: ReactNode }>;
  loader?: (args: LoaderArgs<P>) => unknown | Promise<unknown>;
  beforeLoad?: (args: RouteHookArgs<P>) => void | Promise<void>;
  afterLoad?: (args: Omit<RouteHookArgs<P>, 'redirect' | 'setContext'>) => void | Promise<void>;
  actions?: (args: Omit<RouteHookArgs<P>, 'redirect'>) => Record<string, (data: Record<string, unknown>) => unknown | Promise<unknown>>;
  pendingFallback?: ReactNode;
  errorFallback?: ComponentType<{ error: Error }> | LazyComponent;
  staleTime?: number;
  gcTime?: number;
  retry?: Retry;
  optimistic?: boolean;
  pollingInterval?: number;
  minLoaderDuration?: number;
  scrollRestoration?: ScrollRestorationOption;
  scrollRestorationBehavior?: ScrollRestorationBehavior;
};
export type FileRouteDefinition<Id extends RouteId = RouteId, Options extends FileRouteOptions<ParamsFor<Id>> = FileRouteOptions<ParamsFor<Id>>> = {
  id: Id;
  options: Options;
  useParams(): ParamsFor<Id>;
  useSearch(): SearchParams;
  useLoaderData<T = Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown>(): T;
  useRouteStatus(): RouteStatus;
};
export type RouteApi<Id extends RouteId = RouteId> = {
  id: Id;
  useParams(): ParamsFor<Id>;
  useSearch(): SearchParams;
  useLoaderData<T = unknown>(): T;
  useRouteStatus(): RouteStatus;
};
export type RouteNode = Omit<FileRouteDefinition, 'options'> & { options: FileRouteOptions<any>; path: string; children: RouteNode[] };
export type RouteMatch = { route: RouteNode; params: Record<string, string>; key: string };
export type LoaderState = { data: unknown; loaderError: Error | null; beforeLoadError: Error | null };
export type RouterSnapshot = { location: RouterLocation; status: RouteStatus; matches: RouteMatch[]; data: Map<string, unknown>; errors: Map<string, Error> };

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
export type RouterProps = {
  routes: RouteNode;
  notFound?: ReactNode;
  pendingFallback?: ReactNode;
  errorFallback?: ComponentType<{ error: Error }>;
  maxCacheSize?: number;
  isAnimated?: boolean;
  animationDuration?: number;
  defaultRetry?: Retry;
  defaultStaleTime?: number;
  defaultLoaderFallback?: ReactNode;
  defaultErrorElement?: ReactNode;
  defaultPrefetch?: DefaultPrefetch;
  defaultHoverPrefetchDelay?: number;
  defaultMinLoaderDuration?: number;
  errorBoundary?: ComponentType<{ children: ReactNode }>;
  defaultBeforeLoad?: FileRouteOptions['beforeLoad'];
  defaultAfterLoad?: FileRouteOptions['afterLoad'];
  defaultScrollRestorationBehavior?: ScrollRestorationBehavior;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  context?: Record<string, unknown>;
  enableCacheSnapshot?: boolean;
};
export type NavigateOptions = { search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown; replace?: boolean };

type ParamForSegment<Segment extends string> = Segment extends '$' ? { _splat: string } : Segment extends `$${infer Name}` ? { [K in Name]: string } : Record<never, never>;
type ParamsFromSegments<Segments extends string> = Segments extends `${infer Head}/${infer Tail}` ? ParamForSegment<Head> & ParamsFromSegments<Tail> : ParamForSegment<Segments>;
export type ParamsFor<Id extends string> = ParamsFromSegments<Id extends `/${infer Rest}` ? Rest : Id>;
type NonRoot<Id> = Id extends '__root__' ? never : Id;
type StrictParams<Id extends RouteId> = keyof ParamsFor<Id> extends never ? { params?: never } : { params: ParamsFor<Id> };
export type TypedDestination<Id extends RouteId = NonRoot<RouteId>> = Id extends RouteId ? { to: Id } & StrictParams<Id> & NavigateOptions : never;
type KnownDestination = TypedDestination<NonRoot<RouteId>>;

export type ElementProps<T extends HTMLElement = HTMLElement> = {
  'ref': Ref<T>;
  'href': string;
  'className'?: string;
  'style'?: CSSProperties;
  // Deliberately loose: Link's handlers must be forwardable to arbitrary host elements
  // and third-party components (Mantine Button component="a", MUI Button, etc.).
  onClick: (event: any) => void;
  onMouseEnter: (event: any) => void;
  onMouseLeave: (event: any) => void;
  'children'?: ReactNode;
  'aria-current'?: 'page';
  'aria-busy'?: boolean;
} & Record<`data-${string}` | `aria-${string}`, unknown>;

export type LinkState = { isActive: boolean; isPending: boolean };
export type LinkDestination = KnownDestination | ({ toRaw: string; params?: Record<string, string | number> } & NavigateOptions);
export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'style' | 'className'> & {
  prefetch?: DefaultPrefetch;
  hoverPrefetchDelay?: number;
  className?: string | ((state: LinkState) => string);
  activeClassName?: string;
  pendingClassName?: string;
  style?: CSSProperties | ((state: LinkState) => CSSProperties);
  beforeNavigate?(): Promise<void>;
  exact?: boolean;
  as?: (props: ElementProps<any>, state: LinkState) => ReactElement;
} & LinkDestination;

export type NavigateTarget = TypedDestination | string | -1 | ({ toRaw: string } & NavigateOptions);
export type RouterRuntime = {
  navigate(target: NavigateTarget): Promise<void>;
  invalidate(target?: string | string[] | { to: RouteId; params?: Record<string, string> }, options?: { withChildren?: boolean; staleOnly?: boolean; force?: boolean }): Promise<InvalidateResult[]>;
  prefetch(target: string | { to: RouteId; params?: Record<string, string> }): Promise<void>;
};
