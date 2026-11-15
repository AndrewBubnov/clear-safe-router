import { createFileRoute, Outlet } from 'typed-router';
import { NestLayout } from '@/pages/NestLayout';

export const Route = createFileRoute('/playground/nest')({
  layout: NestLayout,
  component: () => <Outlet />,
});
