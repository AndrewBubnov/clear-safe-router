import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/blocker')({
  component: lazy(() => import('@/pages/BlockerPage')),
});
