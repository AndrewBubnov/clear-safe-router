import { createFileRoute, lazy } from '../index';

export const Route = createFileRoute('/$')({
  component: lazy(() => import('../playground/NotFound')),
});
