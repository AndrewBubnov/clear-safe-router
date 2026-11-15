import { createFileRoute, lazy } from 'typed-router';

export const Route = createFileRoute('/$')({
  component: lazy(() => import('@/pages/NotFound')),
});
