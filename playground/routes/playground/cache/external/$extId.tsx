import { createFileRoute, lazy } from "clear-safe-router";

import { fetchExternalQuote } from "@/pages/api";
import { PageSkeleton } from "@/pages/Skeletons";
import { getQueryClient } from "@/pages/queryClient";

/**
 * External data cache demo (TanStack Query). The loader delegates storage and
 * freshness to the queryClient passed via <Router context>: query() resolves
 * from the cache while the entry is fresh (5s staleTime) and awaits a refetch
 * once it is stale.
 *
 * Note: no route staleTime/gcTime here on purpose — with those set, the
 * router's own cache would serve its (possibly stale) copy without asking the
 * external cache. The section route flags `externalCache: true`, which the
 * kernel enforces: the router cache never claims freshness below it. See the
 * "External data cache" recipe in README.md.
 */
export const Route = createFileRoute("/playground/cache/external/$extId")({
  loader: ({ context, params }) =>
    getQueryClient(context).query({
      queryKey: ["quote", params.extId],
      queryFn: () => fetchExternalQuote(params.extId),
      staleTime: 5000,
    }),
  pendingFallback: <PageSkeleton />,
  component: lazy(() => import("@/pages/ExternalCachePage")),
});
