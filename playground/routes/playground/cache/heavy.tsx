import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchHeavy, HEAVY_GC_TIME } from '@/pages/api';

export const Route = createFileRoute('/playground/cache/heavy')({
  loader: fetchHeavy,
  staleTime: Infinity,
  gcTime: HEAVY_GC_TIME,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/HeavyPage')),
});
