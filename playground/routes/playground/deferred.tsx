import { createFileRoute, lazy } from 'clear-safe-router';

import { DeferredSkeleton } from '@/pages/Skeletons';
import { fetchDeferredDashboard } from '@/pages/api';

export const Route = createFileRoute('/playground/deferred')({
  loader: fetchDeferredDashboard,
  staleTime: 10000,
  pendingFallback: <DeferredSkeleton />,
  component: lazy(() => import('@/pages/DeferredPage')),
});
