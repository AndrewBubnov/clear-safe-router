import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { CACHE_STALE_TIME, fetchCachePayload } from '@/pages/api';

export const Route = createFileRoute('/playground/cache/')({
  loader: fetchCachePayload,
  staleTime: CACHE_STALE_TIME,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/CachePage')),
});
