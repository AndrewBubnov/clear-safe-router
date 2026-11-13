import { createFileRoute, Outlet } from '../../../index';

export const Route = createFileRoute('/playground/cache')({
  component: () => <Outlet />,
});
