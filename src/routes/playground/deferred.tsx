import { createFileRoute, lazy } from '../../index';

import { DeferredSkeleton } from '../../playground/Skeletons';
import { fetchDeferredDashboard } from '../../playground/api';

export const Route = createFileRoute('/playground/deferred')({
  loader: fetchDeferredDashboard,
  staleTime: 10000,
  pendingFallback: <DeferredSkeleton />,
  component: lazy(() => import('../../playground/DeferredPage')),
});
