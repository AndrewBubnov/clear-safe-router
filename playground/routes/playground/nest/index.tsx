import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/nest/')({
  component: lazy(() => import('@/pages/NestPage')),
});
