import { createFileRoute, lazy } from '../../index';


export const Route = createFileRoute('/playground/search')({
  component: lazy(() => import('../../playground/SearchPage')),
});
