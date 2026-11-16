# Clear Safe Router

[![CI](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml/badge.svg)](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/clear-safe-router)](https://www.npmjs.com/package/clear-safe-router)

A provider-free React SPA router with **file-based routing** and **compile-time type-safe navigation** — nested routes, typed `Link` and hooks, loaders with caching, actions, blockers, prefetching, and scroll restoration, all wired up by a small Vite plugin.

Built on the core runtime from [clear-react-router](https://github.com/AndrewBubnov/clear-react-router). Clear Safe Router adds the file-based route generation and the compile-time type layer on top of it.

## Why Clear Safe Router?

Most React routers ask you to choose: central route config *or* file-based routes, runtime checks *or* type safety. Clear Safe Router does both halves at once:

- **File-based routing** — a route is a file under your app's routes directory. The Vite plugin generates the route tree and the type registry from your file structure.
- **Compile-time type safety** — `<Link to="...">`, `useNavigate`, `Route.useParams()`, and `Route.useLoaderData()` know every route of your app: unknown route IDs and missing or misnamed params are compile errors, not runtime surprises.
- **Provider-free** — one `<Router />` in the tree, one global store. Every hook and `Link` works anywhere, including components rendered outside the router.
- **Small, explicit API** — loaders, caching, invalidation, blockers, prefetch, actions. No RouteProvider nesting, no plugin context, no magic.

> TL;DR? **[Try the live playground](https://clear-safe-router.vercel.app/)** — no setup, click around.

## Features

- **File-based routing** — routes defined by files, generated into a typed route tree
- **Compile-time type safety** — typed `Link`, `navigate`, `useParams`, `useLoaderData` with route-existence and param checking
- **Nested routes & layouts** — layouts stack outermost-first and stay mounted across child navigation
- **Data loading** — built-in loaders with TTL-based caching (`staleTime`), LRU eviction (`maxCacheSize`), garbage collection (`gcTime`)
- **Route actions** — mutations with automatic invalidation
- **Navigation blocking** — prevent accidental navigation (including browser Back/Forward) with `useBlocker`
- **Programmatic redirects** — redirect from a `beforeLoad` hook
- **Cache invalidation** — manual revalidation of the current route, concrete paths, or dynamic patterns
- **Prefetching** — hover / render / viewport strategies with a bounded, queued prefetch pipeline
- **Optimistic navigation** — instantly render stale cached data while fresh data loads in the background
- **Retry** — automatic loader retry, applied to every cache revalidation path
- **Polling** — revalidate a route's data on an interval while it is active
- **Lazy routes** — code-splitting with `lazy()`
- **Deferred data** — React 19 `use()` support: navigate on fast data, stream the slow parts
- **Scroll restoration** — window and named containers, with manual restore for late content
- **Cache inspection** — opt-in live snapshot of cached loader entries for devtools
- **View transitions** — optional page animations via the native View Transitions API
- **Browser history** — full back/forward support, blockers included

## Getting Started

```bash
npm install clear-safe-router
```

### 1. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { clearSafeRouter } from 'clear-safe-router/vite';

export default defineConfig({
  plugins: [
    react(),
    clearSafeRouter(), // scans src/routes, generates src/routeTree.gen.ts
  ],
});
```

The plugin generates the route tree on dev-server start and on every build, watches the routes directory, and full-reloads the page when routes are added or removed. Editing a route file's code regenerates silently — if the tree is unchanged, no full reload happens and Vite's normal HMR applies. Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routesDirectory` | `string` | `'src/routes'` | Directory scanned for route files |
| `generatedFile` | `string` | `'src/routeTree.gen.ts'` | Where the generated route tree is written |

### 2. Create the root route

```tsx
// src/routes/__root.tsx
import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('__root__')({
  component: () => <Outlet />,
});
```

### 3. Create your first routes

```tsx
// src/routes/index.tsx  →  "/"
import { createFileRoute } from 'clear-safe-router';

export const Route = createFileRoute('/')({
  component: () => <h1>Home</h1>,
});
```

```tsx
// src/routes/about.tsx  →  "/about"
import { createFileRoute } from 'clear-safe-router';

export const Route = createFileRoute('/about')({
  component: () => <h1>About</h1>,
});
```

### 4. Mount the router

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { Router } from 'clear-safe-router';
import { routeTree } from './routeTree.gen';

createRoot(document.getElementById('root')!).render(
  <Router routes={routeTree} />
);
```

That's it. `<Link to="/about">` is now a fully typed navigation — try changing it to a route that doesn't exist.

## File Conventions

```
src/routes/
  __root.tsx              # Required root route (id "__root__")
  index.tsx               # "/"
  about.tsx               # "/about"
  products/
    route.tsx             # "/products" — the folder's segment; parent for the folder's children
    index.tsx             # "/products/" (distinct id from "/products")
    $productId.tsx        # "/products/:productId"
    $productId/           # nests under the sibling $productId.tsx (it acts as the parent)
      reviews.tsx         # "/products/:productId/reviews"
  $.tsx                   # Catch-all "/*" (must be terminal), params { _splat }
```

| File | Route ID | Notes |
|------|----------|-------|
| `__root.tsx` | `__root__` | Required. Typically renders `<Outlet />` |
| `index.tsx` | `/products/` | Shares the parent's URL but gets a **distinct ID** (trailing slash) — its own component, loader and cache entry |
| `route.tsx` | `/products` | The folder's own route. Required when a folder has child routes and no sibling file with the same segment name |
| `$name.tsx` | `/products/$name` | Dynamic segment; `$name` becomes a URL param |
| `$name/` (folder) | — | Children nest under the sibling `$name.tsx` route file |
| `$.tsx` | `/$` | Catch-all, matches any depth, `_splat` param. Must be terminal — nothing can nest below it |

Rules the generator enforces (with file-accurate errors in dev):

- Every route file must export `const Route = createFileRoute('<its id>')(...)`.
- Route IDs are unique; two files cannot produce the same ID.
- Static and dynamic paths may coexist (`/products/new` and `/products/$productId`); two dynamic segments at the same level must differ in name.
- Dynamic parameter names must be unique within one route.

## The Generated File

`routeTree.gen.ts` (do not edit) contains two things:

```ts
// 1. The runtime tree the <Router> consumes
export const routeTree = { /* nested RouteNode tree with resolved paths */ };

// 2. A module augmentation registering your route IDs with the library
declare module 'clear-safe-router' {
  export interface TypedRouterRouteMap {
    '/': unknown;
    '/about': unknown;
    '/products/$productId': unknown;
    // ...
  }
}
```

Every typed API — `Link`'s `to`, `useNavigate`, `Route.useParams()`, `Route.useLoaderData()`, `getRoute()` — derives its literals from `keyof TypedRouterRouteMap`. The library itself never lists routes: your app registers them by generating this file. Add a route file, and the whole typed surface knows it on the next generation.

## Deployment (static hosting)

The router uses the History API (`pushState` + `popstate`) exclusively — there is no hash mode. Deep links and page refreshes therefore need an SPA fallback on static hosts: every path must serve `index.html`, otherwise refreshing e.g. `/about` returns 404.

The playground in this repo deploys as-is: `vercel.json` builds only the playground (`npm run build:playground`), publishes its `dist-playground/` output, and rewrites every path to `index.html`:

```json
{
  "buildCommand": "npm run build:playground",
  "outputDirectory": "dist-playground",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Deploying **your own app** built on the library — a plain Vite app with the default `dist/` output — only needs the rewrites:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Netlify (`public/_redirects`):

```text
/*    /index.html   200
```

The host rewrite only serves the app shell. To render your own UI for unknown client-side URLs, add a catch-all route (`$.tsx`) — see [File Conventions](#file-conventions).

## API

### `<Router />`

Rendered once. Owns browser URL/history and the global store.

```tsx
import { Router } from 'clear-safe-router';
import { routeTree } from './routeTree.gen';

<Router routes={routeTree} />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `routes` | `RouteNode` | required | The generated `routeTree` |
| `notFound` | `ReactNode` | `<p>Not found</p>` | Rendered when no route matches the URL |
| `pendingFallback` | `ReactNode` | `undefined` | Global fallback shown while the first navigation is pending |
| `errorFallback` | `ComponentType<{ error: Error }>` | `undefined` | Global error view for routes without their own `errorFallback` |
| `errorBoundary` | `ComponentType<{ children }>` | `undefined` | Custom error boundary around the route tree (catches render-time errors) |
| `maxCacheSize` | `number` | `100` | Maximum cached loader entries; the least recently used entry is evicted when the limit is reached (the active route's entry is never evicted) |
| `isAnimated` | `boolean` | `false` | Enable page transitions via the native View Transitions API |
| `animationDuration` | `number` | browser default | Transition duration in ms |
| `context` | `Record<string, unknown>` | `{}` | Initial router context. Passing a new object after mount merges it into the existing context |
| `defaultStaleTime` | `number` | `0` | Default time before cached loader data is considered stale |
| `defaultRetry` | `number \| { count, delay }` | `undefined` | Default revalidation retry policy |
| `defaultPrefetch` | `'hover' \| 'render' \| 'viewport' \| 'none' \| 'auto'` | `'hover'` | Default prefetch strategy for `Link`s. `'auto'` resolves at hover-time: `hover` on desktop, `viewport` on mobile |
| `defaultHoverPrefetchDelay` | `number` | `150` | Hover delay in ms before prefetching |
| `defaultMinLoaderDuration` | `number` | `0` | Default minimum time the pending fallback stays visible (anti-flicker) |
| `defaultBeforeLoad` | hook | `undefined` | Runs first in the `beforeLoad` guard chain of every navigation (before all route hooks, receiving the leaf's params) |
| `defaultAfterLoad` | hook | `undefined` | Runs after every successful navigation (after the leaf route's own `afterLoad`) |
| `defaultScrollRestorationBehavior` | `'auto' \| 'smooth' \| 'instant'` | `'auto'` | Default scroll restoration behavior |
| `revalidateOnFocus` | `boolean` | `false` | Stale-only revalidation when the tab regains focus |
| `revalidateOnReconnect` | `boolean` | `false` | Stale-only revalidation when the browser regains connectivity |
| `enableCacheSnapshot` | `boolean` | `false` | Builds the snapshot consumed by [`useCacheSnapshot()`](#usecachesnapshot) |

### `createFileRoute(id)(options)`

The single export a route file provides. `id` is the file's route ID; the type layer checks it against the generated registry.

| Option | Type | Description |
|--------|------|-------------|
| `component` | `ComponentType \| LazyComponent` | The route's element. Plain functions, `React.memo`/`forwardRef` wrappers, `React.lazy` and the router's `lazy()` all work. Omitted on parent routes: an implicit `<Outlet />` renders the child automatically |
| `layout` | `ComponentType<{ children }>` | Wraps this route's content — see [Layouts](#layouts) |
| `loader` | `({ params, search, context, signal, attempt, location }) => unknown \| Promise<unknown>` | Loads the route's data. Runs top-down (parent first), before the route renders |
| `beforeLoad` | `({ params, search, context, location, redirect, setContext }) => void \| Promise<void>` | Runs for **every matched route on the chain** (parent → leaf, before any loader) — see [`redirect`](#redirect-redirect-in-beforeload) |
| `afterLoad` | `({ params, search, context, location }) => void \| Promise<void>` | Runs after a successful navigation to this route |
| `actions` | `(args) => Record<string, (data) => unknown \| Promise<unknown>>` | Route mutations — see [Route Actions](#route-actions) |
| `pendingFallback` | `ReactNode` | Shown while this route's loader (or first data load) is pending |
| `errorFallback` | `ComponentType<{ error }>` \| `LazyComponent` | Error view for this route's loader/`beforeLoad` errors |
| `staleTime` | `number` | ms before cached data is stale. `Infinity` keeps it fresh until invalidated, evicted or garbage-collected |
| `gcTime` | `number` | ms an unused cache entry survives after navigating away before being garbage-collected |
| `retry` | `number \| { count, delay }` | Revalidation retry policy — see [Retry](#retry) |
| `optimistic` | `boolean` | Navigate instantly using stale cached data while it revalidates |
| `pollingInterval` | `number` | Revalidate this route's data every N ms while active (ignores `staleTime`) |
| `minLoaderDuration` | `number` | Minimum time the pending fallback stays visible |
| `scrollRestoration` | `boolean \| string[]` | Restore window scroll (`true`) or named containers (array of element `id`s) |
| `scrollRestorationBehavior` | `'auto' \| 'smooth' \| 'instant'` | Scroll behavior for restoration |

**Loader/hook args:**

```ts
{
  params: Record<string, string>;     // URL params matched for THIS route
  search: Record<string, string>;     // URL search parameters
  context: Record<string, unknown>;   // router context
  location: RouterLocation;           // { pathname, search, state }
}
```

The `loader` additionally receives:

```ts
{
  signal: AbortSignal; // aborted when a newer navigation supersedes this one — pass to fetch()
  attempt: number;     // 1-based attempt counter: 1 on first try, 2+ on retries
}
```

> **Note:** `beforeLoad` runs for **every matched route** on the chain, parent first, leaf last — and **before any loader runs**. A guard declared on a section route protects every URL under it, and a redirect or a thrown error at any level cancels the rest of the chain *and* all loaders below it. This makes `beforeLoad` the place for auth guards that also prevent unnecessary data fetching. `defaultBeforeLoad` (global) runs first, receiving the leaf's params.

**What the generated `Route` object gives you** (typed per route ID):

```tsx
import { Route } from './routes/products/$productId';

Route.useParams();       // { productId: string } — typed
Route.useSearch();       // Record<string, string>
Route.useLoaderData();   // loader return type — inferred, no generics needed
Route.useRouteStatus();  // 'idle' | 'pending' | 'active' | 'optimistic' | 'error'
Route.useErrors();       // { loaderError, beforeLoadError } — this route's failures
```

For imperative access anywhere (even outside the router), `getRoute` returns the same typed API:

```tsx
import { getRoute } from 'clear-safe-router';

const productRoute = getRoute('/products/$productId');
productRoute.useParams().productId; // typed: string
productRoute.useLoaderData();       // typed from the route's loader — the generated map carries each route's Route object type
```

### Nested routes & layouts

A folder nests under its `route.tsx` (or sibling file). A parent route needs **no component**: the router renders an implicit `<Outlet />` for any route whose children match. Add a `component` only when the parent itself renders content — then it must render `<Outlet />` where children appear.

```tsx
// src/routes/nest/route.tsx — layout-only parent
import { createFileRoute, Outlet } from 'clear-safe-router';

export const Route = createFileRoute('/nest')({
  component: Outlet, // or omit — implicit
});
```

```tsx
// src/routes/nest/$nestId/route.tsx — chrome + outlet
export const Route = createFileRoute('/nest/$nestId')({
  layout: NestChildLayout,
  component: Outlet,
});
```

```tsx
// src/routes/nest/$nestId/index.tsx — the page itself
export const Route = createFileRoute('/nest/$nestId/')({
  loader: ({ params }) => fetchNest(params.nestId),
  staleTime: Infinity,
  pendingFallback: <ProductSkeleton />,
  component: NestChildPage,
});
```

**Layouts** are declared per route with `layout` and are passed `children`:

- A route's `layout` wraps its content *and* every descendant rendered through its outlet — so layouts stack outermost-first as you go deeper.
- Layouts survive child navigation, including navigations that run child loaders: only the content below swaps; the shared chrome, its state and DOM identity stay alive.
- Pass a stable reference (module-scope component). Layouts are components, not elements: `layout: Shell`, not `layout: <Shell />`.

> **Splitting a parameterized section.** When a dynamic route (`$nestId.tsx`) owns both its own page and child routes, prefer the folder form: `nest/$nestId/route.tsx` (layout + outlet) plus `nest/$nestId/index.tsx` (the page, its loader and its cache entry). The index route only matches when no child does, so its loader doesn't re-run on child URLs and its typed `useParams()` stays exactly `{ nestId }`.

### `Link`

Typed client-side navigation with active/pending state, prefetch support, and custom-element rendering.

The signature rule: **`to` for a known route, `params` for its `$segments`** — route existence and param shape are checked at compile time:

```tsx
<Link to="/products/$productId" params={{ productId: '7' }}>Show product</Link>
<Link to="/about">About</Link>

<Link to="/does-not-exist" />
// ❌ compile error: not a registered route ID

<Link to="/products/$productId" />
// ❌ compile error: params missing

<Link to="/products/$productId" params={{ id: '7' }} />
// ❌ compile error: wrong param name
```

Escape hatch for runtime-computed URLs:

```tsx
<Link toRaw={`/products/${id}/print`}>Print view</Link>
```

Catch-all routes take their special param:

```tsx
<Link to="/$" params={{ _splat: 'docs/getting-started' }}>Docs</Link>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `to` | route ID (typed) | required (unless `toRaw`) | Target route ID; must exist in the generated registry |
| `toRaw` | `string` | required (unless `to`) | Raw URL escape hatch |
| `params` | `Record<string, string \| number>` | required for `$segments` | Segment values (URL-encoded). Missing params throw at runtime and fail type checking |
| `search` | `string \| Record<string, string \| number \| boolean \| null \| undefined>` | `undefined` | Query string or object appended to the target |
| `state` | `unknown` | `undefined` | Arbitrary value attached to the history entry |
| `replace` | `boolean` | `false` | Replace the history entry instead of pushing |
| `exact` | `boolean` | `false` | When `false`, the link is also active on nested URLs (`/settings` active at `/settings/profile`) |
| `prefetch` | `'hover' \| 'render' \| 'viewport' \| 'none'` | `Router` config | Per-link prefetch strategy override |
| `hoverPrefetchDelay` | `number` | `Router` config | Per-link hover delay override |
| `beforeNavigate` | `() => Promise<void>` | `undefined` | Awaited before navigation starts |
| `as` | `(props: ElementProps<T>, state: LinkState) => ReactElement` | renders `<a>` | Custom element rendering — see [Custom elements via `as`](#custom-elements-via-as) |
| `children` | `ReactNode` | required | Link content |
| `className` | `string \| ({ isActive, isPending }) => string` | `undefined` | Class name(s), optionally dynamic |
| `style` | `CSSProperties \| ({ isActive, isPending }) => CSSProperties` | `undefined` | Inline styles, optionally dynamic |
| `activeClassName` | `string` | `'active-link'` | Applied when the link matches the current URL |
| `pendingClassName` | `string` | `'pending-link'` | Applied while the link's target is loading |

Active matching: `'/'` matches only exactly `'/'`; any other target is active on exact match or — with the default `exact={false}` — on nested URLs too. Pass `exact` on contextual links (e.g. a back-link to `/settings`) when a child URL should not keep the link active.

**Accessibility:** active links expose `aria-current="page"`, loading targets expose `aria-busy="true"`; both are omitted when inactive. Extra `data-*`/`aria-*` props are forwarded to the rendered element.

**State values:** `isActive` — the link matches the current URL (respecting `exact`); `isPending` — the target route is currently loading.

#### Prefetch strategies

| Strategy | Behavior |
|----------|----------|
| `'hover'` | Prefetches on hover (configurable delay) |
| `'render'` | Prefetches immediately when the link is rendered — use sparingly |
| `'viewport'` | Prefetches when the link enters the viewport (IntersectionObserver, 250ms dwell) |
| `'none'` | No prefetching |

> A prefetched entry stays fresh for 30 seconds: the first navigation within that window reuses it without running the loader. After that, the route's normal `staleTime` applies. Prefetch never shortens a longer route `staleTime`. Prefetches are queued with bounded concurrency (4 parallel, 2 on mobile) and also preload the target route's lazy chunk. Prefetching runs the target's `beforeLoad` guard chain first — if a guard would redirect or fail, nothing is prefetched, so protected data never lands in the cache. The check never touches the global context store: a guard's `setContext` (e.g. preparing a token for the loader) flows into the prefetch loaders through a local context instead.

#### Styling link states with CSS

Active and loading states are already in the DOM — attribute selectors cover most custom designs with zero JS:

```css
.gear-link[aria-current='page'] { color: steelblue; }
.gear-link[aria-busy='true'] { opacity: 0.6; }
```

#### Custom elements via `as`

`as` renders a custom element instead of `<a>`. The function receives the props to spread (`href`, `ref`, handlers, `className`, `style`, `children`) and — separately, so they are never forwarded to the DOM — `{ isActive, isPending }`:

```tsx
import { Link, type ElementProps } from 'clear-safe-router';

const Button = ({ children, ...rest }: ElementProps<HTMLButtonElement>, { isActive }: LinkState) => (
  <button {...rest} style={{ background: isActive ? 'tomato' : 'green' }}>
    {children}
  </button>
);

<Link to="/about" as={Button}>To about page</Link>
```

Every received prop **must** be spread onto the host element — dropping one silently disables the corresponding feature (`ref` → viewport prefetch never triggers, `onClick` → no navigation, `href` → no keyboard/screen-reader access). Because `as` is called as a plain function, avoid hooks inside it.

For UI-kit components, wrap them inline and forward the props:

```tsx
<Link to="/about" as={(props, { isActive }) => <MantineButton {...props} variant={isActive ? 'light' : 'subtle'} />}>
  To about page
</Link>
```

## Loaders & Caching

Loaders run **top-down** — every matched route's loader, parent first, before anything renders. Each route's data is cached under its own key (`route id + URL`), so a child page and its parent cache independently:

```tsx
// src/routes/products/$productId.tsx
export const Route = createFileRoute('/products/$productId')({
  loader: ({ params, signal }) => fetchProduct(params.productId, { signal }),
  staleTime: 60_000,          // fresh for a minute
  gcTime: 10 * 60_000,        // evicted from memory 10 min after you leave
  pendingFallback: <ProductSkeleton />,
});
```

Caching semantics:

- **Route-scoped keys** — each route's data is cached under `routeId|ownPath+search`, where `ownPath` is the part of the URL the route's own pattern consumes. A parent route shares one cache entry across all deeper URLs: navigating between sibling children (`/shop/a/1` → `/shop/a/2`) never refetches the parent's loader, while a different param value (`/shop/b`) is genuinely new data. Trailing slashes collapse into the same entry (`/users/1/` ≡ `/users/1`).

- **`staleTime`** — cached data is reused while fresh. Default `0`: every navigation revalidates. `Infinity` — fresh until explicitly invalidated, evicted or garbage-collected.
- **`gcTime`** — a timer starts when you navigate away; when it fires, the entry is dropped from memory even if still fresh. Coming back before it fires cancels the timer. Independent from `staleTime` — data can be fresh and still get garbage-collected.
- **`maxCacheSize`** — LRU bound. When the limit is reached, the least recently used entry is evicted (even a fresh one); the active route's entry is never evicted.
- **Abortability** — pass `signal` to `fetch()`; a superseded navigation cancels the in-flight loader.
- **`minLoaderDuration`** — keeps the pending fallback visible for at least N ms to avoid flicker on fast loaders.

**Optimistic navigation** renders the stale cached value immediately while a fresh load runs:

```tsx
{ optimistic: true }
```

**Polling** revalidates on an interval while the route is active, ignoring `staleTime`; navigation away stops it. The deepest matched route declaring `pollingInterval` wins:

```tsx
{ pollingInterval: 5000 }
```

## Retry

Transient failures can be retried automatically:

```tsx
retry: 3                       // up to 3 additional attempts
retry: { count: 3, delay: 500 } // with 500ms between attempts
```

Route-level `retry` overrides `defaultRetry` on the `<Router>`. Retry is applied to the router's cache revalidation pipeline, so it works uniformly for initial loads, revalidations, `invalidate()` and `prefetch()` — the loader is the single source of truth for route data.

## Redirects (`beforeLoad`)

`beforeLoad` runs for every matched route on the chain, parent first — so a guard declared on a section route covers all URLs under it. `redirect` aborts the rest of the hook body and the rest of the chain (including all loaders) and loads the target location instead (replacing the history entry). Redirect chains are capped at 10 hops; a guard that keeps redirecting (a loop) fails the navigation with an error on that route instead of hanging:

```tsx
// src/routes/admin/route.tsx — protects every URL under /admin
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, redirect }) => {
    if (!context.isAuthorized) return redirect('/login');
  },
});
```

```tsx
export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context, redirect }) => {
    if (!context.isAuthorized) return redirect('/login');
    // with state for the return trip:
    // return redirect({ pathname: '/login', state: { from: '/dashboard' } });
  },
});
```

A redirect aborts the current navigation chain and loads the target location instead (replacing the history entry).

## Route Actions

Route-scoped mutations. After a successful action, the route it was triggered from is automatically invalidated (its loader re-runs in the background):

```tsx
export const Route = createFileRoute('/notes')({
  loader: fetchNotes,
  actions: ({ context }) => ({
    add: async (data: { text: string }) => api.addNote(data.text, context),
  }),
  component: NotesPage,
});
```

### `useSubmitAction()`

Wraps a route action with submission state and gives you a native-form handler plus a raw `submit` for any form library:

```tsx
const { onSubmit, submit, isSubmitting, data, error } = useSubmitAction('add', {
  onSuccess: () => {},
  onError: (e) => {},
  autoReset: true, // reset the native form after success
});

<form onSubmit={onSubmit}>...</form>      // native form
await submit({ text: 'Buy milk' });       // any data source (react-hook-form, etc.)
```

### `useAction()`

Direct access for programmatic mutations (dialogs, context menus, shortcuts) — same automatic invalidation:

```tsx
const add = useAction('add');
await add({ text: 'Hello' });
```

## Error Handling

- **Loader / `beforeLoad` errors** → the route's `errorFallback` (or the router's `errorFallback`). The error object is also available via typed status APIs.
- **Render errors** → the router-level `errorBoundary` prop.

```tsx
<Router routes={routeTree} errorBoundary={AppErrorBoundary} />
```

## Lazy Routes

```tsx
import { createFileRoute, lazy } from 'clear-safe-router';

export const Route = createFileRoute('/heavy')({
  component: lazy(() => import('./pages/HeavyPage')),
  pendingFallback: <PageSkeleton />,
});
```

The lazy chunk is preloaded by prefetching links, and `pendingFallback` covers both the chunk load and the loader.

## Deferred Data (React 19 `use()`)

A loader may return unresolved promises — the router awaits only what the loader itself awaits:

```tsx
loader: async () => {
  const summary = await fetchSummary();
  const traffic = fetchTraffic(); // not awaited
  return { summary, traffic };
},
```

```tsx
const Chart = () => {
  const { traffic } = Route.useLoaderData();
  return use(traffic); // suspends only the chart
};
```

> Wrap deferred parts in their own error boundary — a rejected promise passed to `use()` is not caught by the route's `errorFallback`. Set `staleTime` generously enough to outlast the slowest deferred request.

## Animations

```tsx
<Router routes={routeTree} isAnimated animationDuration={220} />
```

Uses the native View Transitions API; all loaders complete before the transition starts. Older browsers gracefully fall back to regular navigation (Chrome/Edge 111+, Safari 18+, Firefox 144+).

## Scroll Restoration

```tsx
export const Route = createFileRoute('/feed')({
  scrollRestoration: true,               // window scroll
  scrollRestoration: ['feed-panel'],     // named scrollable containers by id
  scrollRestorationBehavior: 'instant',
});
```

Positions are captured on navigation away and restored when you come back. The option is read from the deepest matched route that declares it, so setting `scrollRestoration` on a layout or parent covers all of its children. Restoration also re-fires when the same route renders with different params (`/item/1` → `/item/2`), not just on route mount. For content that arrives *after* the automatic restore (deferred data, late chunks, `useEffect` fetches), restore manually:

```tsx
const restoreScroll = useRestoreScroll();

<Suspense fallback={<Skeleton />}>
  <Table rows={data.rows} onReady={restoreScroll} />
</Suspense>
```

Calling it is always safe — it does nothing when nothing is saved for the current route.

## Hooks

All hooks work outside `<Router>` — state lives in a global store. Only back/forward handling needs a mounted `<Router>`.

### `useNavigate()`

```tsx
const navigate = useNavigate();

navigate({ to: '/products/$productId', params: { productId: '7' } }); // typed
navigate('/about?tab=info');                                          // raw string
navigate({ toRaw: '/runtime/path', search: '?x=1', state: { from: 'home' }, replace: true });
navigate(-1);                                                         // back
```

The typed form checks route existence and params exactly like `<Link to>`. Navigation state is read via `useLocation()`.

### `Route.useErrors()`

Every route's API exposes its own loader failures — typed per route, no depth guessing:

```tsx
const { loaderError, beforeLoadError } = Route.useErrors();
```

The same is available imperatively via `getRoute(id).useErrors()`. There is deliberately no global `useParams()`/`useLoaderState()`: inside the route tree every component reads its own level through `Route.*`, which is always typed and always the route you meant.

### `useLocation()`

```tsx
const { pathname, search, state } = useLocation();
```

#### Where you came from

Every location carries `prevLocation` — the pathname and search of the location you navigated away from. It is a flat pointer (`{ pathname, search }`), not a history chain, and is `undefined` until the first navigation completes.

```tsx
const location = useLocation();
// After visiting /shop, then /shop/cats:
//   location.prevLocation === { pathname: '/shop', search: '' }

// A contextual back link
<button onClick={() => routerRuntime.navigate(location.prevLocation ?? { toRaw: '/' })}>
  Back
</button>
```

After a guard redirect, `prevLocation` stays the URL the user **tried** to reach — the `/protected` page they asked for, not the `/login` they landed on — so a "back to the page you wanted" link points at the right thing. Back/forward navigation (popstate) updates it too: the page you pop away from becomes the new `prevLocation`.

### `useRouteStatus()`

```tsx
const status = useRouteStatus();                                          // 'idle' | 'pending' | 'active' | 'optimistic' | 'error'
const isLoading = useRouteStatus(s => s === 'pending' || s === 'optimistic');
```

The **global** navigation status — independent of any route, usable outside the tree (global loading indicators in a shell/navbar). Inside a route component prefer `Route.useRouteStatus()` for that route's id-bound status. Untyped by design: status values are a fixed enum, not route-dependent data.

### `useRouterContext()`

```tsx
const { context, setContext } = useRouterContext();
setContext({ ...context, user: { name: 'John' } });
```

### `useSearchParams()`

```tsx
const { searchParams, getSearchParams, setSearchParams } = useSearchParams();

getSearchParams('brand');              // 'nike' | ['nike', 'reebok'] | null
setSearchParams('brand', 'nike');      // ?brand=nike
setSearchParams('brand', ['a', 'b']);  // ?brand=a&brand=b
setSearchParams(prev => { prev.set('page', '2'); return prev; }); // functional
```

`setSearchParams` replaces the current history entry in place and does **not** re-run the loader. If the loader depends on query params, navigate explicitly or call `await useInvalidate()()` after.

### `useInvalidate()`

Revalidates cached route data:

```tsx
const invalidate = useInvalidate();

await invalidate();                    // current route
await invalidate('/posts');            // concrete path
await invalidate(['/posts', '/profile']); // several
await invalidate('/post/$id');         // pattern — every cached match: /post/1, /post/17, ...
await invalidate('/posts', { withChildren: true }); // + cached child URLs
await invalidate('/notes', { staleOnly: true });    // only already-stale entries
await invalidate('/about', { force: false });       // cache-only (never fetch uncached paths)
```

Returns `{ path, data, error }[]` — one entry per revalidated route. A successful revalidation of the active route also resets its status to `active`, so recovering from an error page is just `await invalidate()`. Pattern targets are always cache-only — they never fetch the pattern itself.

### `useCacheSnapshot()`

Read-only live snapshot of the loader cache, for devtools panels. Requires `<Router enableCacheSnapshot>`:

```tsx
const entries = useCacheSnapshot();
// { path, data, timestamp, staleTime, reason, gcExpiresAt, gcDuration, isCached, isLoading }[]
```

Entries appear for in-flight first loads too (`isCached: false, isLoading: true`), and revalidating entries keep `data` so a panel can show the previous value while refreshing.

### `useBlocker(callback)`

Blocks navigation — including browser Back/Forward — while the callback returns `true`:

```tsx
const { state, process, reset } = useBlocker(({ nextLocation }) => hasUnsavedChanges);

useEffect(() => {
  if (state === 'blocked') {
    if (confirm('Leave without saving?')) process();
    else reset();
  }
}, [state, process, reset]);
```

| Return | Description |
|--------|-------------|
| `state` | `'unblocked'` — not armed; `'charged'` — armed, nothing attempted; `'blocked'` — an attempt was just intercepted |
| `blocked` | `state === 'blocked'` |
| `process()` | Confirm and complete the blocked navigation |
| `reset()` | Cancel and stay |

The callback receives `{ location, nextLocation, context }`. It is evaluated after every commit (never during render), so closure state like form dirtiness stays reactive. When a Back/Forward press is blocked, the URL change is reverted until `process()`/`reset()` is called. If the component using `useBlocker` unmounts — while charged or mid-block — the blocker releases automatically and any pending target is dropped: navigation is never stuck.

### `useRestoreScroll()`

Manual scroll restoration callback — see [Scroll Restoration](#scroll-restoration).

## Requirements

- React 18+ (React 19 for deferred `use()` data)
- Vite 5+
- Default exports for lazily loaded route components

## Repository Structure

```
src/            # the library (runtime, typed API, Vite plugin, tests)
playground/     # the demo app: pages/, routes/, its generated route tree
scripts/        # the route generator (also available as a library script)
```

## License

MIT
