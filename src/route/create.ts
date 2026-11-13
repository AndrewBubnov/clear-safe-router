import type { FileRouteDefinition, FileRouteOptions, ParamsFor, RouteApi, RouteId } from '../types';
import { useRouteData } from '../runtime';

type LoaderData<Options> = Options extends { loader: (...args: never[]) => infer Data } ? Awaited<Data> : unknown;
type FileDefinition<Id extends RouteId, Options extends FileRouteOptions<ParamsFor<Id>>> = FileRouteDefinition<Id, Options>;

export const createFileRoute = <const Id extends RouteId>(id: Id) => <const Options extends FileRouteOptions<ParamsFor<Id>>>(options: Options): FileDefinition<Id, Options> => ({
  id,
  options,
  useParams: () => useRouteData(id).params as ParamsFor<Id>,
  useSearch: () => useRouteData(id).search,
  useLoaderData: <T = LoaderData<Options>>() => useRouteData(id).data as T,
  useRouteStatus: () => useRouteData(id).status,
});

export const getRoute = <const Id extends RouteId>(id: Id): RouteApi<Id> => ({
  id,
  useParams: () => useRouteData(id).params as ParamsFor<Id>,
  useSearch: () => useRouteData(id).search,
  useLoaderData: <T = unknown>() => useRouteData(id).data as T,
  useRouteStatus: () => useRouteData(id).status,
});
