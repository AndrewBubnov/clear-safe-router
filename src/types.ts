import type { AnchorHTMLAttributes, ComponentType, MouseEventHandler, ReactNode } from 'react';
import type { RouteId as GeneratedRouteId } from './routeTree.gen';

export type RouteId = GeneratedRouteId;
export type SearchParams = Record<string, string>;
export type RouteStatus = 'idle' | 'pending' | 'active' | 'optimistic' | 'error';
export type Retry = number | { count: number; delay: number };
export type RouterLocation = { pathname: string; search: string; state?: unknown; key?: string };
export type LoaderArgs<P extends Record<string, string> = Record<string, string>> = {
  params: P;
  search: SearchParams;
  context: Record<string, unknown>;
  signal: AbortSignal;
  attempt: number;
  location: RouterLocation;
};
export type RouteHookArgs<P extends Record<string, string> = Record<string, string>> = Omit<LoaderArgs<P>, 'signal' | 'attempt'> & {
  redirect(to: string | { pathname: string; search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown }): Promise<void>;
  setContext(update: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>)): void;
};
export type FileRouteOptions<P extends Record<string, string> = Record<string, string>> = {
  component?: ComponentType;
  layout?: ComponentType<{ children: ReactNode }>;
  loader?: (args: LoaderArgs<P>) => unknown | Promise<unknown>;
  beforeLoad?: (args: RouteHookArgs<P>) => void | Promise<void>;
  afterLoad?: (args: Omit<RouteHookArgs<P>, 'redirect' | 'setContext'>) => void | Promise<void>;
  actions?: (args: Omit<RouteHookArgs<P>, 'redirect'>) => Record<string, (data: Record<string, unknown>) => unknown | Promise<unknown>>;
  pendingFallback?: ReactNode;
  errorFallback?: ComponentType<{ error: Error }>;
  staleTime?: number;
  gcTime?: number;
  retry?: Retry;
  optimistic?: boolean;
  pollingInterval?: number;
  scrollRestoration?: boolean;
};
export type FileRouteDefinition<Id extends RouteId = RouteId, Options extends FileRouteOptions<ParamsFor<Id>> = FileRouteOptions<ParamsFor<Id>>> = {
  id: Id;
  options: Options;
  useParams(): ParamsFor<Id>;
  useSearch(): SearchParams;
  useLoaderData<T = Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown>(): T;
  useRouteStatus(): RouteStatus;
};
export type RouteNode = Omit<FileRouteDefinition, 'options'> & { options: FileRouteOptions<any>; path: string; children: RouteNode[] };
export type RouteMatch = { route: RouteNode; params: Record<string, string>; key: string };
export type RouterSnapshot = { location: RouterLocation; status: RouteStatus; matches: RouteMatch[]; data: Map<string, unknown>; errors: Map<string, Error> };
export type RouterProps = { routes: RouteNode; notFound?: ReactNode; pendingFallback?: ReactNode; errorFallback?: ComponentType<{ error: Error }>; maxCacheSize?: number };
export type NavigateOptions = { search?: string | Record<string, string | number | boolean | null | undefined>; state?: unknown; replace?: boolean };

type ParamForSegment<Segment extends string> = Segment extends '$' ? { _splat: string } : Segment extends `$${infer Name}` ? { [K in Name]: string } : Record<never, never>;
type ParamsFromSegments<Segments extends string> = Segments extends `${infer Head}/${infer Tail}` ? ParamForSegment<Head> & ParamsFromSegments<Tail> : ParamForSegment<Segments>;
export type ParamsFor<Id extends string> = ParamsFromSegments<Id extends `/${infer Rest}` ? Rest : Id>;
type NonRoot<Id> = Id extends '__root__' ? never : Id;
type StrictParams<Id extends RouteId> = keyof ParamsFor<Id> extends never ? { params?: never } : { params: ParamsFor<Id> };
export type TypedDestination<Id extends RouteId = NonRoot<RouteId>> = Id extends RouteId ? { to: Id } & StrictParams<Id> & NavigateOptions : never;
type KnownDestination = TypedDestination<NonRoot<RouteId>>;
export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & { prefetch?: 'hover' | 'render' | 'viewport' | 'none'; onClick?: MouseEventHandler<HTMLAnchorElement> } & (KnownDestination | ({ toRaw: string; params?: Record<string, string | number> } & NavigateOptions));
export type NavigateTarget = TypedDestination | string | -1 | ({ toRaw: string } & NavigateOptions);
export type RouterRuntime = {
  navigate(target: NavigateTarget): Promise<void>;
  invalidate(target?: string | { to: RouteId; params?: Record<string, string> }, options?: { withChildren?: boolean; staleOnly?: boolean; force?: boolean }): Promise<void>;
  prefetch(target: string | { to: RouteId; params?: Record<string, string> }): Promise<void>;
};
