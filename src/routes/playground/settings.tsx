import { createFileRoute, lazy } from '../../index';


export const Route = createFileRoute('/playground/settings')({
  component: lazy(() => import('../../playground/SettingsPage')),
});
