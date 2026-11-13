import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { FileRouteDefinition, FileRouteOptions, ParamsFor, RouteId } from './types';
import { useRouteData, useRouterSnapshot } from './runtime';

export const createFileRoute = <const Id extends RouteId>(id: Id) => <const Options extends FileRouteOptions<ParamsFor<Id>>>(options: Options): FileDefinition<Id, Options> => ({
  id,
  options,
  useParams: () => useRouteData(id).params as ParamsFor<Id>,
  useSearch: () => useRouteData(id).search,
  useLoaderData: <T = LoaderData<Options>>() => useRouteData(id).data as T,
  useRouteStatus: () => useRouteData(id).status,
});

type LoaderData<Options> = Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown;
type FileDefinition<Id extends RouteId, Options extends FileRouteOptions<ParamsFor<Id>>> = FileRouteDefinition<Id, Options>;
export type RouterDefaults = { pendingFallback?: ReactNode; errorFallback?: ComponentType<{ error: Error }> };
const MatchIndex = createContext(0);
const DefaultsContext = createContext<RouterDefaults>({});
export const Outlet = () => {
  const index = useContext(MatchIndex);
  const state = useRouterSnapshot();
  return index + 1 < state.matches.length ? <RouteOutlet index={index + 1} /> : null;
};
export const RouteOutlet = ({ index }: { index: number }) => {
  const state = useRouterSnapshot();
  const match = state.matches[index];
  if (!match) return null;
  const { route } = match;
  const routeData = useRouteData(route.id);
  const defaults = useContext(DefaultsContext);
  const error = state.errors.get(route.id);
  const loading = state.status === 'pending' || state.status === 'optimistic';
  const pending = loading && !!route.options.loader && routeData.data === undefined;
  let content: ReactNode = null;
  if (error) {
    const ErrorView = route.options.errorFallback ?? defaults.errorFallback;
    content = ErrorView ? <ErrorView error={error} /> : <p role="alert">{error.message}</p>;
  } else if (pending) {
    content = route.options.pendingFallback ?? defaults.pendingFallback ?? null;
  } else if (route.options.component) {
    const Component = route.options.component;
    content = <Component />;
  } else if (index < state.matches.length - 1) {
    content = <Outlet />;
  }
  const body = <MatchIndex.Provider value={index}>{content}</MatchIndex.Provider>;
  const Layout = route.options.layout;
  return Layout ? <Layout>{body}</Layout> : body;
};
export const RouteMatchRoot = ({ children, index = 0, defaults }: { children?: ReactNode; index?: number; defaults?: RouterDefaults }) => (
  <DefaultsContext.Provider value={defaults ?? {}}>
    <MatchIndex.Provider value={index}>{children}</MatchIndex.Provider>
  </DefaultsContext.Provider>
);
