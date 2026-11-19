/**
 * React adapter types. The framework-free kernel types live in `./core/types`;
 * this file re-exports them and adds the view layer: route component/layout/
 * fallback fields, `Link` element props and the `Router` props.
 */
import type { AnchorHTMLAttributes, ComponentType, CSSProperties, ReactElement, ReactNode, Ref } from 'react';
import {
  type DefaultPrefetch,
  type NavigateOptions,
  type ParamsFor,
  type Retry,
  type RouteId,
  type RouteLogicOptions,
  type RouteMatch as CoreRouteMatch,
  type RouteStatus,
  type RouterSnapshot as CoreRouterSnapshot,
  type ScrollRestorationBehavior,
  type SearchParams,
  type TypedDestination,
  type TypedRouterRouteMap,
} from './core/types';
import { LAZY_MARKER } from './core/constants';

export type {
  BlockerState,
  CacheReason,
  CacheSnapshot,
  CacheSnapshotEntry,
  DefaultPrefetch,
  InvalidateOptions,
  InvalidateResult,
  LoaderArgs,
  LazyModule,
  NavigateOptions,
  NavigateTarget,
  ParamsFor,
  RedirectTarget,
  Retry,
  RouteHookArgs,
  RouteId,
  RouteLogicOptions,
  RouteStatus,
  RouterLocation,
  RouterRuntime,
  ScrollRestorationBehavior,
  ScrollRestorationOption,
  SearchParams,
  SetStateFn,
  Synchronizer,
  TypedDestination,
  TypedRouterRouteMap,
} from './core/types';

export type LazyComponent = { readonly [LAZY_MARKER]: true; importFn: () => Promise<{ default: ComponentType }> };

/** The full route options a route file may declare: kernel logic + view fields. */
export type FileRouteOptions<P extends Record<string, string> = Record<string, string>> = RouteLogicOptions<P> & {
  component?: ComponentType | LazyComponent;
  layout?: ComponentType<{ children: ReactNode }>;
  pendingFallback?: ReactNode;
  errorFallback?: ComponentType<{ error: Error }> | LazyComponent;
};
export type LoaderDataFor<Id> = Id extends keyof TypedRouterRouteMap
  ? TypedRouterRouteMap[Id & keyof TypedRouterRouteMap] extends { options: infer Options } ? Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown : unknown
  : unknown;
export type FileRouteDefinition<Id extends RouteId = RouteId, Options extends FileRouteOptions<ParamsFor<Id>> = FileRouteOptions<ParamsFor<Id>>> = {
  id: Id;
  options: Options;
  useParams(): ParamsFor<Id>;
  useSearch(): SearchParams;
  useLoaderData<T = Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown>(): T;
  useRouteStatus(): RouteStatus;
  useErrors(): { loaderError: Error | null; beforeLoadError: Error | null };
};
export type RouteApi<Id extends RouteId = RouteId> = {
  id: Id;
  useParams(): ParamsFor<Id>;
  useSearch(): SearchParams;
  useLoaderData<T = LoaderDataFor<Id>>(): T;
  useRouteStatus(): RouteStatus;
  useErrors(): { loaderError: Error | null; beforeLoadError: Error | null };
};
export type RouteNode = Omit<FileRouteDefinition, 'options'> & { options: FileRouteOptions<any>; path: string; children: RouteNode[] };
/** Adapter-instantiated snapshots: matches carry the full route object with
 * view fields and hook methods, so components read them without casts. */
export type RouteMatch = CoreRouteMatch<RouteNode>;
export type RouterSnapshot = CoreRouterSnapshot<RouteNode>;

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
  /** Freshness window (ms) a prefetch keeps over a route's own staleTime. `0`
   * disables it — recommended for apps whose loaders delegate to an external
   * data cache (TanStack Query). Default: 30s. */
  defaultPrefetchStaleTime?: number;
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
export type LinkDestination = TypedDestination<NonRoot<RouteId>> | ({ toRaw: string; params?: Record<string, string | number> } & NavigateOptions);
type NonRoot<Id> = Id extends '__root__' ? never : Id;
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
