import { createFileRoute, Outlet } from '../../../../index';

export const Route = createFileRoute('/playground/cache/product')({
  component: () => <Outlet />,
});
