import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchDoomed } from '@/pages/api';

export const Route = createFileRoute('/playground/retry-raw')({
  loader: fetchDoomed,
  retry: 0,
  pendingFallback: <PageSkeleton />,
  errorFallback: lazy(() => import('@/pages/RetryErrorView')),
  component: () => <div>Unreachable — this loader always fails</div>,
});
