import { createFileRoute, lazy } from '../../../index';

import { PageSkeleton } from '../../../playground/Skeletons';
import { fetchHeavy, HEAVY_GC_TIME } from '../../../playground/api';

export const Route = createFileRoute('/playground/cache/heavy')({
  loader: fetchHeavy,
  staleTime: Infinity,
  gcTime: HEAVY_GC_TIME,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('../../../playground/HeavyPage')),
});
