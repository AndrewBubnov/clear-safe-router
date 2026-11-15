import { createFileRoute, Outlet } from 'typed-router';

import { NestChildLayout } from '@/pages/NestChildLayout';

export const Route = createFileRoute('/playground/nest/$nestId')({
  layout: NestChildLayout,
  component: Outlet,
});
