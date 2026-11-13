import { createFileRoute, lazy } from '../../index';


import { PageSkeleton } from '../../playground/Skeletons';
import { fetchUnstable } from '../../playground/api';

export const Route = createFileRoute('/playground/retry')({
  loader: fetchUnstable,
  retry: { count: 3, delay: 400 },
  staleTime: 10000,
  pendingFallback: <PageSkeleton />,
  errorFallback: lazy(() => import('../../playground/RetryErrorPage')),
  component: lazy(() => import('../../playground/RetryPage')),
});
