import { createFileRoute, Outlet } from 'typed-router';

export const Route = createFileRoute('/playground/nest/$nestId/item')({
  component: Outlet,
});
