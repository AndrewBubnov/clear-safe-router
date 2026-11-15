import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('/playground/cache')({
  component: () => <Outlet />,
});
