import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/settings')({
  component: lazy(() => import('@/pages/SettingsPage')),
});
