import { createFileRoute, Outlet } from 'clear-safe-router';

/**
 * The external data cache owns freshness for everything below this section.
 * Dropping the prefetch window to 0 keeps hover prefetch (it still warms the
 * external cache) while making the loader re-run on every navigation — so the
 * external cache, not the router, decides whether a refetch happens.
 */
export const Route = createFileRoute('/playground/cache/external')({
	prefetchStaleTime: 0,
	component: () => <Outlet />,
});
