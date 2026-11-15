import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/settings')({
  component: lazy(() => import('@/pages/SettingsPage')),
});
