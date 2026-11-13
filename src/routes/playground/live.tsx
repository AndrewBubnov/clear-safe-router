import { createFileRoute, lazy } from '../../index';

import { PageSkeleton } from '../../playground/Skeletons';
import { fetchQuotes } from '../../playground/api';

export const Route = createFileRoute('/playground/live')({
  loader: fetchQuotes,
  pollingInterval: 3000,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('../../playground/LivePage')),
});
