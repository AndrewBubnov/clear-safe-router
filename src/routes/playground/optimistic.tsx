import { createFileRoute, lazy } from '../../index';

import { PageSkeleton } from '../../playground/Skeletons';
import { fetchOptimisticValue } from '../../playground/api';

export const Route = createFileRoute('/playground/optimistic')({
  loader: fetchOptimisticValue,
  staleTime: 800,
  optimistic: true,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('../../playground/OptimisticPage')),
});
