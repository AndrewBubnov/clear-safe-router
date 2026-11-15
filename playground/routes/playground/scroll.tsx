import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/scroll')({
  scrollRestoration: ['feed', 'gallery'],
  scrollRestorationBehavior: 'smooth',
  optimistic: true,
  component: lazy(() => import('@/pages/ScrollPage')),
});
