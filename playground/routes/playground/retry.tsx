import { createFileRoute, lazy } from 'clear-safe-router';


import { PageSkeleton } from '@/pages/Skeletons';
import { fetchUnstable } from '@/pages/api';

export const Route = createFileRoute('/playground/retry')({
  loader: fetchUnstable,
  retry: { count: 3, delay: 400 },
  staleTime: 10000,
  pendingFallback: <PageSkeleton />,
  errorFallback: lazy(() => import('@/pages/RetryErrorPage')),
  component: lazy(() => import('@/pages/RetryPage')),
});
