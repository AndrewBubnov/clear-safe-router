import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/guard')({
  component: lazy(() => import('@/pages/GuardPage')),
});
