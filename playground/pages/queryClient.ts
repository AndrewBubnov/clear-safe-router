import { QueryClient } from '@tanstack/react-query';

/**
 * App-owned external data cache (TanStack Query). Routed loaders delegate
 * storage and freshness to this client instead of the router's own cache —
 * see the "External data cache" recipe in README.md.
 *
 * Deliberately NOT part of the router: the router kernel stays data-agnostic,
 * and the client is passed through <Router context={{ queryClient }}> so
 * loaders, guards and actions all read the same facts.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,
			refetchOnWindowFocus: false,
		},
	},
});

/** LoaderArgs.context is Record<string, unknown>; keep the one cast here. */
export const getQueryClient = (context: Record<string, unknown>): QueryClient => {
	if (!(context.queryClient instanceof QueryClient)) {
		throw new Error('QueryClient is missing from router context — pass it via <Router context={{ queryClient }}>');
	}
	return context.queryClient;
};
