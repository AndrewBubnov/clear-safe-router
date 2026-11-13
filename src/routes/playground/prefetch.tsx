import { createFileRoute, lazy } from '../../index';

import { PageSkeleton } from '../../playground/Skeletons';
import { fetchSlow } from '../../playground/api';

export const Route = createFileRoute('/playground/prefetch')({
  loader: fetchSlow,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('../../playground/PrefetchPage')),
});
