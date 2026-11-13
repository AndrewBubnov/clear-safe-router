import { createFileRoute, lazy } from '../../index';


export const Route = createFileRoute('/playground/blocker')({
  component: lazy(() => import('../../playground/BlockerPage')),
});
