import { createFileRoute, Outlet } from 'clear-safe-router';

/**
 * The external data cache owns freshness for everything below this section:
 * `externalCache: true` means the router cache never claims freshness here —
 * hover prefetch still warms the external cache, but the loader re-runs on
 * every navigation and the external cache decides whether a refetch happens.
 * Children inherit the flag; a child can opt out with an explicit `false`.
 */
export const Route = createFileRoute('/playground/cache/external')({
	externalCache: true,
	component: () => <Outlet />,
});
