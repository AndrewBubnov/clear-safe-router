import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('/playground/cache/product')({
  component: () => <Outlet />,
});
