import { createFileRoute, Link } from '../index';

export const Route = createFileRoute('/$')({
  component: () => {
    const { _splat } = Route.useParams();
    return <main><h1>Catch all</h1><p>path: {_splat}</p><Link to="/">Home</Link></main>;
  },
});
