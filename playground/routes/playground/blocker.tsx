import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/blocker')({
  component: lazy(() => import('@/pages/BlockerPage')),
});
