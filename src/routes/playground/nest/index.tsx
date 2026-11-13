import { createFileRoute, lazy } from '../../../index';


export const Route = createFileRoute('/playground/nest/')({
  component: lazy(() => import('../../../playground/NestPage')),
});
