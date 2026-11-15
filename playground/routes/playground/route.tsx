import { createFileRoute, Outlet } from 'typed-router';

export const Route = createFileRoute('/playground')({
  component: () => <Outlet />,
});
