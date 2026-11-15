import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/guard')({
  component: lazy(() => import('@/pages/GuardPage')),
});
