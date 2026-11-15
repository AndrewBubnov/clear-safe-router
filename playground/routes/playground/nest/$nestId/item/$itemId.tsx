import { createFileRoute, lazy } from 'typed-router';

import { ProductSkeleton } from '@/pages/Skeletons';
import { fetchNestItem } from '@/pages/api';

export const Route = createFileRoute('/playground/nest/$nestId/item/$itemId')({
  loader: ({ params }) => fetchNestItem(params.nestId, params.itemId),
  staleTime: Infinity,
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('@/pages/NestItemPage')),
});
