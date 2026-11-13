import { createFileRoute, Outlet } from '../../index';

export const Route = createFileRoute('/members')({
  component: () => <section><h1>Members</h1><Outlet /></section>,
});
