import { createFileRoute, lazy } from '../../../../../index';

import { ProductSkeleton } from '../../../../../playground/Skeletons';
import { fetchNestItem } from '../../../../../playground/api';

export const Route = createFileRoute('/playground/nest/$nestId/item/$itemId')({
  loader: ({ params }) => fetchNestItem(params.nestId, params.itemId),
  staleTime: Infinity,
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('../../../../../playground/NestItemPage')),
});
