import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/nest/')({
  component: lazy(() => import('@/pages/NestPage')),
});
