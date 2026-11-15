import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('/playground/nest/$nestId/item')({
  component: Outlet,
});
