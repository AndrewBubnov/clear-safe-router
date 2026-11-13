import { createFileRoute, Outlet } from '../index';

export const Route = createFileRoute('__root__')({
  component: () => <Outlet />,
});
