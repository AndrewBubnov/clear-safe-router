import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/search')({
  component: lazy(() => import('@/pages/SearchPage')),
});
