import { createFileRoute, lazy } from 'typed-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchOptimisticValue } from '@/pages/api';

export const Route = createFileRoute('/playground/optimistic')({
  loader: fetchOptimisticValue,
  staleTime: 800,
  optimistic: true,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/OptimisticPage')),
});
