import { createFileRoute, Outlet } from '../../../../../index';

export const Route = createFileRoute('/playground/nest/$nestId/item')({
  component: () => <Outlet />,
});
