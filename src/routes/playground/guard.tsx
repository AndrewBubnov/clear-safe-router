import { createFileRoute, lazy } from '../../index';


export const Route = createFileRoute('/playground/guard')({
  component: lazy(() => import('../../playground/GuardPage')),
});
