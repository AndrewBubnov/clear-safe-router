import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('__root__')({
  component: () => <Outlet />,
});
