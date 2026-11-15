import { createFileRoute, Outlet } from 'typed-router';

export const Route = createFileRoute('/playground/cache/product')({
  component: () => <Outlet />,
});
