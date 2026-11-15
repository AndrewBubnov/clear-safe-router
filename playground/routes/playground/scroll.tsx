import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/scroll')({
  scrollRestoration: ['feed', 'gallery'],
  scrollRestorationBehavior: 'smooth',
  optimistic: true,
  component: lazy(() => import('@/pages/ScrollPage')),
});
