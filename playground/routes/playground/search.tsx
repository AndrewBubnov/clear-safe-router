import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/search')({
  component: lazy(() => import('@/pages/SearchPage')),
});
