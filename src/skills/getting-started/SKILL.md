---
name: getting-started
description: Set up and build with clear-safe-router — file-based, provider-free routing for React SPAs with compile-time type-safe navigation, per-path+search loader caching, URL search state, blocking, invalidation and prefetch. Route any AI task about this library here first.
metadata:
  type: framework
  library: 'clear-safe-router'
  framework: react
sources:
  - https://github.com/AndrewBubnov/clear-safe-router/blob/main/README.md
  - https://github.com/AndrewBubnov/clear-safe-router/blob/main/playground/routes
  - https://github.com/AndrewBubnov/clear-safe-router/blob/main/src/core/types.ts
---

# clear-safe-router

A provider-free React SPA router with file-based routing and compile-time
type-safe navigation. There is no provider and no React context: all state
lives in a global store, components subscribe through hooks. One `<Router>` at
the root, hooks anywhere. The kernel (`clear-safe-router/core`) is
framework-free; all DOM access goes through a `RouterEnv` seam.

## Setup

Routes are files. The Vite plugin scans the routes directory and generates
`routeTree.gen.ts` (a typed `RouteNode` tree):

```tsx
// routes/users/index.tsx
import { createFileRoute, lazy } from 'clear-safe-router';

export const Route = createFileRoute('/users')({
	loader: ({ params, search, signal }) => fetchUsers(params, search, signal),
	staleTime: 10_000, // cache entry lives this long
	pendingFallback: <PageSkeleton />, // rendered while status is 'pending'
	component: lazy(() => import('../pages/UsersPage')),
});
```

```tsx
// App.tsx — routes come from the generator, typed against every route file
import { routeTree } from './routeTree.gen';
import { Router } from 'clear-safe-router';

createRoot(root).render(<Router routes={routeTree} />);
```

Wire the plugin once in `vite.config.ts` (`clear-safe-router/vite`): it
regenerates the tree on dev-server start, build start, and route-file
add/remove.

```tsx
// Any component — data is read per route id; the type flows from the loader,
// no manual generic needed
import { getRoute, useNavigate } from 'clear-safe-router';

const route = getRoute('/users');
const data = route.useLoaderData();
const navigate = useNavigate();
navigate('/users/42');
navigate({ to: '/users', search: '?sort=asc' });
```

## Feature map

The whole surface, one line each — details live in the references (load by
 task below):

- **Routing** — file-based routes (`__root`, `index`, `route.tsx` sections,
  `$param`, `$.tsx` catch-all), `layout` + `<Outlet />` nesting, lazy
  components, compile-time typed navigation (`NavigateTarget` checked against
  the generated route registry).
- **Loader caching** — per `pathname + search` keys with canonicalized search;
  `staleTime` (route) / `defaultStaleTime`, `gcTime` + `maxCacheSize` (LRU
  eviction), `invalidate()` (chain-wide, patterns, `staleOnly`).
- **Retry** — `retry: { count, delay }` or a number, per route or
  `defaultRetry`; abortable mid-delay.
- **Polling** — `pollingInterval` re-runs the loader while the route is active;
  stops on leave, restarts on return.
- **Loading UX** — `optimistic` (instant cache hit for revisited keys),
  `keepPreviousData` (previous data held during pending), `pendingFallback`,
  `minLoaderDuration` (no skeleton flashing), `errorFallback`.
- **External data cache** — `externalCache` route flag (+`defaultExternalCache`):
  hand freshness to TanStack Query or similar; the router never claims fresh.
- **Search params** — `useSearchParams()`; every combination is a cached
  navigation (see the dedicated reference — the data-table pattern).
- **Guards & hooks** — `beforeLoad` (redirect, signal), `afterLoad`,
  `defaultBeforeLoad`.
- **Blocking** — `useBlocker` for dirty forms: charged → blocked →
  `proceed()`/`reset()`.
- **Actions** — route-owned mutations via `actions` + `useSubmitAction`, with
  automatic invalidation of affected cache.
- **Prefetch** — `defaultPrefetch: 'hover' | 'viewport' | 'none'`, per-link
  override, concurrency 4/2, never supersedes a running flight.
- **Scroll restoration** — `scrollRestoration` (window or named containers),
  behavior configurable.
- **View transitions** — `isAnimated` / `animationDuration` wrap navigations in
  `startViewTransition`.

## Essential constraints

- **No context, no provider.** Hooks read a global singleton; render `<Router>` once.
- **Route files own the route.** Conventions: `__root.tsx` (required), `index.tsx`,
  `route.tsx` (a section wrapper that contributes options/layout to its children
  without adding a path segment), `$param.tsx` (dynamic segment), `$.tsx`
  (catch-all, keep it last). Paths inside a directory nest naturally; the
  generator validates ids, param names and file shape.
- **The loader is the data owner.** `loader` receives
  `{ params, search, context, signal, attempt, location }` and returns anything
  serializable. Its result is cached per **`pathname + search`** — a different
  query string is a different entry. `search` is a plain object (multi-value
  keys collapse; read `location.search` raw for repeated keys).
- **`beforeLoad` is for guards, not data.** Redirect via `redirect()` in its
  args; a thrown/rejected error lands in `beforeLoadError` and renders
  `errorFallback`.
- **Search params are navigations.** `setSearchParams` performs a full
  navigation: it pushes a history entry and re-runs the loader for the new
  `pathname + search`. Never bypass it by writing to the store or calling
  `history.*` directly.
- **Render during loading is a three-slot pipeline** (route-level opt-ins, see
  below): `optimistic` → `keepPreviousData` → `pendingFallback`. Errors always
  replace content with `errorFallback`.
- **Routes without a `loader` never have loader data.** Do not read `data` on a
  loader-less route.
- **Aborts are automatic.** Each navigation has one signal, passed to the
  loader; superseding a navigation cancels the previous flight. Do not create
  your own `AbortController` for loaders.

## Load by task

- Route files, nesting, layouts, Outlet, params, catch-all, lazy components →
  [routes and loaders](references/routes-and-loaders.md)
- Caching, `staleTime`/`gcTime`, loading UX (`optimistic`, `keepPreviousData`,
  `pendingFallback`, retry, polling, external cache) →
  [routes and loaders](references/routes-and-loaders.md)
- URL query state, filters/sort/pagination tables, multi-value params →
  [search params as state](references/search-params-state.md)
- Navigation, blockers, invalidation, prefetch, actions, scroll →
  [navigation and blocking](references/navigation-blocking-invalidation.md)

## API discovery

Inspect `src/index.tsx` (the only public entry point), then `src/core/types.ts`
for route options, `LoaderArgs` and hook signatures, and `src/types.ts` for
`FileRouteOptions`. The playground (`playground/routes/` +
`playground/pages/`) shows every feature wired end-to-end against a fake
in-browser server; the data-table demo is the reference for URL-owned query
state.
