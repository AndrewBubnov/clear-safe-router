import { createFileRoute, lazy } from '../../../index';

import { PageSkeleton } from '../../../playground/Skeletons';
import { CACHE_STALE_TIME, fetchCachePayload } from '../../../playground/api';

export const Route = createFileRoute('/playground/cache/')({
  loader: fetchCachePayload,
  staleTime: CACHE_STALE_TIME,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('../../../playground/CachePage')),
});
