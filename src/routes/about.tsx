import { createFileRoute, useNavigate } from '../index';

export const Route = createFileRoute('/about')({
  loader: async () => ({ message: 'Generated file route is working' }),
  component: () => {
    const data = Route.useLoaderData<{ message: string }>();
    const navigate = useNavigate();
    return <main><h1>{data.message}</h1><button onClick={() => navigate('/')}>Home</button></main>;
  },
});
