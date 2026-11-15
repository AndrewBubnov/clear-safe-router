import { createFileRoute, lazy } from 'clear-safe-router';

import { ProductSkeleton } from '@/pages/Skeletons';
import { fetchNest } from '@/pages/api';

export const Route = createFileRoute('/playground/nest/$nestId/')({
  loader: ({ params }) => fetchNest(params.nestId),
  staleTime: Infinity,
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('@/pages/NestChildPage')),
});
