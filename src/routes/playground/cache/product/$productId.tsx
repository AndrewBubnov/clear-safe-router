import { createFileRoute, lazy } from '../../../../index';

import { ProductSkeleton } from '../../../../playground/Skeletons';
import { fetchProduct } from '../../../../playground/api';

export const Route = createFileRoute('/playground/cache/product/$productId')({
  loader: ({ params }) => fetchProduct(params.productId),
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('../../../../playground/ProductPage')),
});
