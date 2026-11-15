import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchSlow } from '@/pages/api';

export const Route = createFileRoute('/playground/prefetch')({
  loader: fetchSlow,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/PrefetchPage')),
});
