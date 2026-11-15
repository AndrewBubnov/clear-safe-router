# Typed Router

[![CI](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml)

A lightweight, provider-free React SPA router with **file-based routing** and **compile-time type-safe navigation**.

Built on the core runtime from [clear-react-router](https://github.com/AndrewBubnov/clear-react-router) — nested routes, loaders with caching, actions, blockers, prefetch, scroll restoration — plus a Vite plugin that generates the route tree and TypeScript types from your file structure.

## Features

- **File-based routing** — Routes defined by files in your app (default `src/routes/`, configurable via the Vite plugin)
- **Compile-time type safety** — Typed `Link`, `navigate`, `useParams` with route existence and param checking
- **Single router** — One global router owns browser URL/history
- **Provider-free** — No context providers needed, all state in stores
- **Loaders with caching** — TTL-based (`staleTime`), LRU eviction (`maxCacheSize`), garbage collection (`gcTime`)
- **Route actions** — Mutations with automatic invalidation
- **Navigation blocking** — Prevent accidental navigation
- **Prefetching** — Hover, viewport, render strategies
- **Optimistic navigation** — Instant render with stale data
- **Scroll restoration** — Window and named containers
- **Lazy routes** — Code-splitting with `lazy()`
- **Retry** — Automatic revalidation retry
- **Polling** — Automatic revalidation interval
- **Deferred data** — React 19 `use()` support

## File Conventions

```
routes/
  __root.tsx              # Required root route (id __root__)
  index.tsx               # "/"
  about.tsx               # "/about"
  products/
    route.tsx             # "/products" — the folder's segment; parent for the folder's children
    index.tsx             # "/products/" (distinct id from /products)
    $productId.tsx        # "/products/:productId"
    $productId/           # nests under $productId.tsx (sibling file is the parent)
      reviews.tsx         # "/products/:productId/reviews"
  $.tsx                   # Catch-all "/*" (must be terminal), params { _splat }
```

### Naming Rules

| Pattern | Example | Matches | Params |
|---------|---------|---------|--------|
| Static | `about.tsx` | `/about` | — |
| Index | `index.tsx` | `/` (or parent `/products/`) | — |
| Dynamic | `$productId.tsx` | `/products/123` | `{ productId: "123" }` |
| Catch-all | `$.tsx` | `/*` | `{ _splat: "path/to/match" }` |
| Folder parent | `products/route.tsx` | `/products` | folder's own segment |
| Nested folder | `$productId/reviews.tsx` next to `$productId.tsx` | `/products/:productId/reviews` | merged params |

Folders with children require a `route.tsx` parent — unless a sibling route file with the same segment name exists (`$productId.tsx` next to `$productId/`), which then acts as the parent. `index.tsx` shares the parent's URL but has a distinct route ID (`/products/` vs `/products`).

### Route Module Exports

```tsx
// routes/products/$productId.tsx
import { createFileRoute } from 'typed-router';

export const Route = createFileRoute('/products/$productId')({
  component: lazy(() => import('./ProductDetail')),
  loader: async ({ params, signal }) => fetchProduct(params.productId, { signal }),
  staleTime: 60_000,
  beforeLoad: async ({ params, redirect }) => {
    if (!params.productId) return redirect('/products');
  },
  actions: ({ params }) => ({
    update: async (data) => api.updateProduct(params.productId, data),
  }),
});
```

The `createFileRoute` helper:
- **Binds the file to a route ID** — Generator validates it matches the file path
- **Provides typed params** — `params` is `{ productId: string }` in loader, beforeLoad, actions
- **Enables typed navigation** — `Link` and `navigate` know this route exists

## Quick Start

```bash
npm install typed-router
```

```tsx
// vite.config.ts
import { typedRouter } from 'typed-router/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), typedRouter()],
});
```

```tsx
// src/main.tsx
import { Router } from 'typed-router';
import { routeTree } from './routeTree.gen'; // Generated — do not edit

createRoot(...).render(<Router routes={routeTree} />);
```

```tsx
// routes/index.tsx
import { createFileRoute } from 'typed-router';

// The generator validates this exact export and ID against the file path
export const Route = createFileRoute('/')({
  component: () => <h1>Home</h1>,
});
```

## Typed Navigation

Type checking is always on: `Link` and `navigate` validate route existence, required parameter names, and reject extra parameters — against the generated `RouteId` union. Raw URLs are an explicit escape hatch, not a fallback level.

```tsx
import { Link, useNavigate } from 'typed-router';

// Typed (route IDs are generated from your files)
<Link to="/products/$productId" params={{ productId: '123' }} />   // ✅
<Link to="/products/$productId" params={{ id: '123' }} />          // ❌ wrong param name
<Link to="/products/$productId" />                                 // ❌ missing params
<Link to="/unknown" />                                             // ❌ route doesn't exist
<Link to="/products" params={{ x: 1 }} />                          // ❌ static route takes no params

// Imperative navigation — same checking
const navigate = useNavigate();
navigate({ to: '/products/$productId', params: { productId: '123' } });

// Escape hatch: raw URL, intentionally unchecked
<Link toRaw="/runtime-generated/path" />
navigate('/runtime/path?x=1');

// Typed params inside the route's own file
const { productId } = Route.useParams(); // typed from the route ID
const data = Route.useLoaderData();      // typed from the loader's return type
```

## Commands

```bash
# Generate route tree and types (run before TypeScript check)
npx typed-router generate

# Dev server — regenerates the route tree, then opens the browser on the playground
npm run dev

# Build
npm run build

# Tests
npm test
```

## Project Structure

```
typed-router/
├── src/
│   ├── index.ts                 # Public API exports
│   ├── runtime/                 # Framework-free core (ported from clear-react-router)
│   │   ├── create.ts           # Pub/sub store
│   │   ├── types.ts            # Core types
│   │   ├── constants.ts
│   │   ├── navigate.ts         # Navigation logic
│   │   ├── revalidateCache.ts  # Cache & loader revalidation
│   │   ├── invalidate.ts       # Invalidation API
│   │   ├── prefetch.ts         # Prefetch logic
│   │   └── syncCacheSnapshot.ts
│   ├── creators/
│   │   └── createRouter.ts     # Route normalization (ported)
│   ├── components/
│   │   ├── Router.tsx          # Main Router component
│   │   └── Link.tsx            # Link component
│   ├── hooks/                  # React hooks (ported)
│   │   ├── useNavigate.ts
│   │   ├── useParams.ts
│   │   ├── useLocation.ts
│   │   ├── useLoaderState.ts
│   │   ├── useInvalidate.ts
│   │   ├── useBlocker.ts
│   │   ├── useAction.ts
│   │   ├── useRouteStatus.ts
│   │   ├── useRouterContext.ts
│   │   ├── useSearchParams.ts
│   │   ├── useSubmitAction.ts
│   │   ├── useRestoreScroll.ts
│   │   └── useCacheSnapshot.ts
│   ├── utils/                  # Utilities (ported)
│   │   ├── create.ts
│   │   ├── lazy.ts
│   │   ├── createLazyComponent.tsx
│   │   ├── findRoute.ts
│   │   ├── utils.ts
│   │   ├── commitState.ts
│   │   ├── commitNavigation.ts
│   │   ├── isCacheItemFresh.ts
│   │   └── renderElement.tsx
│   ├── config/
│   │   └── routerConfig.ts     # Global config singleton
│   ├── instance.ts             # Router singleton
│   └── vite-plugin/
│       ├── index.ts            # Vite plugin entry
│       ├── scanner.ts          # File system scanner
│       ├── generator.ts        # Route tree & types generator
│       └── types.ts            # Generator types
├── playground/                 # Demo app for E2E testing
└── package.json
```

## API Reference

### `createFileRoute<Path>(path)(config)`

Creates a typed route configuration. The `path` literal must match the file's generated route ID.

```ts
createFileRoute('/products/$productId')({
  component: ProductDetail,
  loader: async ({ params }) => ({ product: await fetchProduct(params.productId) }),
  staleTime: 60_000,
  beforeLoad: async ({ params, redirect }) => { ... },
  afterLoad: async ({ params }) => { ... },
  actions: ({ params }) => ({ update: async (data) => ... }),
  layout: ProductLayout,
  errorElement: ProductError,
  fallback: ProductSkeleton,
  loaderFallback: ProductLoader,
  retry: 3,
  gcTime: 300_000,
  optimistic: true,
  pollingInterval: 30_000,
  scrollRestoration: true,
  scrollRestorationBehavior: 'smooth',
  minLoaderDuration: 200,
});
```

### `Router` Props

```tsx
<Router
  routes={routes}                    // Required: generated route tree
  maxCacheSize={150}                 // LRU cache limit (device-aware default)
  isAnimated={false}                 // View Transitions API
  animationDuration={300}
  defaultStaleTime={0}
  defaultLoaderFallback={<Spinner />}
  defaultErrorElement={<Error />}
  defaultPrefetch="hover"            // 'hover' | 'render' | 'viewport' | 'none'
  defaultHoverPrefetchDelay={150}
  defaultMinLoaderDuration={0}
  defaultRetry={3}
  defaultBeforeLoad={async ({ redirect }) => ...}
  defaultAfterLoad={async ({ params }) => ...}
  defaultScrollRestorationBehavior="auto"
  revalidateOnFocus={false}
  revalidateOnReconnect={false}
  context={{ user: null }}
  enableCacheSnapshot={false}
  errorBoundary={ErrorBoundary}
/>
```

### Hooks

All hooks work **outside `<Router>`** — state lives in global stores.

| Hook | Returns |
|------|---------|
| `useNavigate()` | `(arg: string \| Location \| NavigatePathArg \| -1) => Promise<void>` |
| `useParams<TPath>()` | `ParamsFor<TPath>` or `Record<string, string>` |
| `useLocation()` | `{ pathname, search, state, prevLocation }` |
| `useLoaderState<T>()` | `{ data: T, loaderError, beforeLoadError }` |
| `useInvalidate()` | `(path?, options?) => Promise<InvalidateResult[]>` |
| `useBlocker(callback)` | `{ state, process(), reset() }` |
| `useAction(name, options?)` | `(input) => Promise<{ data, error }>` |
| `useRouteStatus(predicate?)` | `Status` or `boolean` |
| `useRouterContext()` | `{ context, setContext }` |
| `useSearchParams()` | `{ searchParams, getSearchParams, setSearchParams }` |
| `useSubmitAction(name, options?)` | `{ submit, onSubmit, data, error, isSubmitting }` |
| `useRestoreScroll(behavior?)` | `() => void` |
| `useCacheSnapshot()` | `CacheSnapshotEntry[]` |

### `Link` Props

```tsx
<Link
  to="/products/$productId"          // Typed: generated route ID (with params if required)
  params={{ productId: '123' }}       // Required if the ID has $segments
  toRaw="/plain/url"                 // Escape hatch: raw URL, unchecked
  search={{ tab: 'details' }}
  state={{ from: 'home' }}
  prefetch="hover"
  hoverPrefetchDelay={100}
  exact={false}
  activeClassName="active"
  pendingClassName="loading"
  className={({ isActive, isPending }) => ...}
  style={({ isActive }) => ...}
  beforeNavigate={async () => ...}
  as={(props, { isActive, isPending }) => <CustomElement {...props} />}
/>
```

## Generated Files

The generator produces a single file (do not edit manually):

```
routeTree.gen.ts        # routeTree (runtime tree) + augmentation of TypedRouterRouteMap for typed APIs
```

## License

MIT