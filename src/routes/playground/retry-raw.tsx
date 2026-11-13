import { createFileRoute, lazy } from '../../index';

import { PageSkeleton } from '../../playground/Skeletons';
import { fetchDoomed } from '../../playground/api';

export const Route = createFileRoute('/playground/retry-raw')({
  loader: fetchDoomed,
  retry: 0,
  pendingFallback: <PageSkeleton />,
  errorFallback: lazy(() => import('../../playground/RetryErrorView')),
  component: () => <div>Unreachable — this loader always fails</div>,
});
