import { createFileRoute } from '../../index';

export const Route = createFileRoute('/members/$memberId')({
  loader: async ({ params }) => ({ id: params.memberId }),
  // Loader data type is inferred from the loader's return type; no manual annotation needed.
  component: () => <p>{Route.useParams().memberId}: {Route.useLoaderData().id}</p>,
});
