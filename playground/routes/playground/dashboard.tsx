import { createFileRoute, lazy } from 'typed-router';


export const Route = createFileRoute('/playground/dashboard')({
  beforeLoad: ({ context, redirect }) => {
    if (!context.isAuthorized) return redirect({ pathname: '/playground/guard', state: { from: '/playground/dashboard' } });
  },
  component: lazy(() => import('@/pages/DashboardPage')),
});
