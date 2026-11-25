import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { fetchTableData } from '@/pages/api';

export const Route = createFileRoute('/playground/search')({
  loader: fetchTableData,
  // Every param combination is its own cached navigation; keepPreviousData
  // holds the current rows on screen while a new combination loads.
  staleTime: 60000,
  keepPreviousData: true,
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import('@/pages/SearchPage')),
});
