import { createFileRoute, Outlet } from '../../../index';
import { NestLayout } from '../../../playground/NestLayout';

export const Route = createFileRoute('/playground/nest')({
  layout: NestLayout,
  component: () => <Outlet />,
});
