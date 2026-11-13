import { createFileRoute, lazy } from '../../index';


export const Route = createFileRoute('/playground/scroll')({
  scrollRestoration: ['feed', 'gallery'],
  scrollRestorationBehavior: 'smooth',
  optimistic: true,
  component: lazy(() => import('../../playground/ScrollPage')),
});
