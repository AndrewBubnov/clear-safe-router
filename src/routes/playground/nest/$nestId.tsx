import { createFileRoute, lazy } from '../../../index';

import { NestChildLayout } from '../../../playground/NestChildLayout';
import { ProductSkeleton } from '../../../playground/Skeletons';
import { fetchNest } from '../../../playground/api';

export const Route = createFileRoute('/playground/nest/$nestId')({
  layout: NestChildLayout,
  loader: ({ params }) => fetchNest(params.nestId),
  staleTime: Infinity,
  pendingFallback: <ProductSkeleton />,
  component: lazy(() => import('../../../playground/NestChildPage')),
});
