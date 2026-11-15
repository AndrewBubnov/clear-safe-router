import { createFileRoute, lazy } from 'clear-safe-router';

import { ProductSkeleton } from '@/pages/Skeletons';
import { fetchProduct } from '@/pages/api';

export const Route = createFileRoute('/playground/cache/product/$productId')({
  loader: ({ params }) => fetchProduct(params.productId),
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('@/pages/ProductPage')),
});
