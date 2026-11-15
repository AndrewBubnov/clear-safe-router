import { createFileRoute, lazy } from 'typed-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchQuotes } from '@/pages/api';

export const Route = createFileRoute('/playground/live')({
  loader: fetchQuotes,
  pollingInterval: 3000,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/LivePage')),
});
