# Routes and loaders

## Route files

Routes live in a routes directory (the Vite plugin's configured dir; the
playground uses `playground/routes/`). Conventions:

```tsx
// routes/users/index.tsx — /users
// routes/users/$userId.tsx — /users/:userId ($name = dynamic segment)
// routes/users/route.tsx — section wrapper: options + layout for the children,
//                          no extra path segment of its own
// routes/$.tsx — catch-all, matches any depth; keep it last
// routes/__root.tsx — required root of the tree

import { createFileRoute, lazy } from 'clear-safe-router';

export const Route = createFileRoute('/users/$userId')({
	loader: fetchUser,
	staleTime: 10_000,
	gcTime: 30_000,
	retry: { count: 3, delay: 400 }, // or a number = retry count
	optimistic: true,
	keepPreviousData: true,
	pendingFallback: <Skeleton />,
	errorFallback: lazy(() => import('../pages/UserErrorView')),
	pollingInterval: 3000, // re-run the loader while the route is active
	minLoaderDuration: 400, // minimum pending time — prevents skeleton flashing
	externalCache: true, // data owned by an external cache (see below)
	scrollRestoration: 'feed', // restore window or named container scroll
	beforeLoad: async ({ redirect, signal }) => { /* guards */ },
	afterLoad: async ({ params, context }) => { /* post-commit work */ },
	actions: ({ params, context, setContext }) => ({ /* mutations */ }),
	component: lazy(() => import('../pages/UserPage')),
});
```

Every route file must export `Route = createFileRoute('<literal id>')({...})`;
ids are unique, dynamic params use `$name`. `npm run router:generate` (or the
Vite plugin, automatic in dev/build) regenerates `routeTree.gen.ts`; the tree
augments `clear-safe-router/core` for compile-time typed navigation.

## Layouts and nesting

- `layout: Component` on a route (or a `route.tsx` section) wraps the section
  and receives the rendered children as `children`; layouts stack
  outermost-first and are inherited by descendants.
- Below a layout, nested content renders through `<Outlet />`:

```tsx
import { Outlet } from 'clear-safe-router';
const SectionLayout = () => (
	<div className="section">
		<SectionNav />
		<Outlet />
	</div>
);
```

## Loader args

```ts
loader: ({ params, search, context, signal, attempt, location }) => Promise<unknown>
```

- `params` — path params (`/users/$userId` → `{ userId }`).
- `search` — plain object built from the URL query (multi-value keys collapse
  to the last value; for multi-value reads use `location.search` directly).
- `signal` — abort signal of the owning navigation; pass it to `fetch`.
- `attempt` — 1-based retry attempt number.
- `location` — the target `{ pathname, search, prevLocation? }`.

`setContext` is available in `beforeLoad`, `afterLoad` and `actions` — not in
the loader (the loader reads `context` as it started).

## Caching

- Key: `pathname + search`, with search params canonicalized (stable
  name-then-value sort) — reordered same-name params are one entry.
- Fresh within `staleTime` (route-level) or `defaultStaleTime` (Router prop) →
  the loader does not re-run; revisits are instant.
- Router-level defaults: `defaultStaleTime`, `defaultRetry`,
  `defaultMinLoaderDuration`, `maxCacheSize` (LRU-style eviction), `gcTime` on
  routes for idle eviction.
- `revalidateOnFocus` / `revalidateOnReconnect` (Router props, off by default)
  revalidate the active route in the background.
- **External data caches**: `externalCache: true` on a route (inherited by
  children; `false` opts out; `defaultExternalCache` on `<Router>`) declares
  that the data belongs to an external cache (e.g. TanStack Query via router
  context). The router cache then never claims freshness — the loader re-runs
  on every navigation and the external cache decides whether the network is
  hit. See the "External data cache" recipe in the README.

## Loading UX pipeline

Deciding what to render while a navigation loads, in priority order:

| Condition | Rendered | Status |
| --- | --- | --- |
| Cache has the exact `path + search` key (`optimistic: true`) | cached data of the **new** key, revalidated in background | `optimistic` |
| `keepPreviousData: true`, previous data exists for this route | previous data stays on screen | `pending` |
| otherwise | route `pendingFallback` | `pending` |
| loader or beforeLoad failed | route `errorFallback` (or an inline error view) | `error` |

`keepPreviousData` applies when the pending navigation targets the same route
and the previous location committed data for it — e.g. changing table filters.
The previous value is carried into the pending snapshot (seeded by the
navigation itself); a failed loader always replaces kept data with the error
view.

A pending status is still reported by `useRouteStatus()` — use it for badges
instead of blocking the table (an "updating…" chip that shifts layout is an
anti-pattern here).

## Reading data

```tsx
import { getRoute, useRouteStatus } from 'clear-safe-router';

const route = getRoute('/users/$userId');
const data = route.useLoaderData();     // type flows from the loader — no manual generic
const params = route.useParams();             // { userId: string }
const search = route.useSearch();
const status = useRouteStatus();              // 'idle' | 'pending' | 'active' | 'optimistic' | 'error'
const { loaderError, beforeLoadError } = route.useErrors();
```

Data is committed together with its status: during `pending` the snapshot may
still hold the previous variant's data (with `keepPreviousData` the mismatch is
intentional). Do not assume `data` belongs to the current URL unless `status`
is `active`/`optimistic`.
