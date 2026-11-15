import { createFileRoute, Outlet } from 'clear-safe-router';
import { NestLayout } from '@/pages/NestLayout';

export const Route = createFileRoute('/playground/nest')({
  layout: NestLayout,
  component: () => <Outlet />,
});
