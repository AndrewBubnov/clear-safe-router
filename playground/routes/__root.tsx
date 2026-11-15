import { createFileRoute, Outlet } from 'typed-router';

export const Route = createFileRoute('__root__')({
  component: () => <Outlet />,
});
