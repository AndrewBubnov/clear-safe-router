import { createFileRoute, Outlet } from 'clear-safe-router';

import { NestChildLayout } from '@/pages/NestChildLayout';

export const Route = createFileRoute('/playground/nest/$nestId')({
  layout: NestChildLayout,
  component: Outlet,
});
