import { createFileRoute, lazy } from 'clear-safe-router';


export const Route = createFileRoute('/playground/dashboard')({
  beforeLoad: ({ context, redirect }) => {
    if (!context.isAuthorized) return redirect({ pathname: '/playground/guard', state: { from: '/playground/dashboard' } });
  },
  component: lazy(() => import('@/pages/DashboardPage')),
});
