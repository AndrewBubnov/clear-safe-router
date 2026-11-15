import { createFileRoute, lazy } from 'clear-safe-router';

export const Route = createFileRoute('/$')({
  component: lazy(() => import('@/pages/NotFound')),
});
