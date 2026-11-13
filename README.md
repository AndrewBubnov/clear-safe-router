# Typed Router

[![CI](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/AndrewBubnov/clear-safe-router/actions/workflows/ci.yml)

A lightweight, provider-free React SPA router with **file-based routing** and **compile-time type-safe navigation**.

Built on the core runtime from [clear-react-router](https://github.com/AndrewBubnov/clear-react-router) — nested routes, loaders with caching, actions, blockers, prefetch, scroll restoration — plus a Vite plugin that generates the route tree and TypeScript types from your file structure.

## Features

- **File-based routing** — Routes defined by files in `src/routes/`
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
src/routes/
  __root.tsx          # Root layout (wraps entire app)
  index.tsx           # Home route ("/")
  about.tsx           # Static route ("/about")
  products/
    index.tsx         # "/products"
    route.tsx         # Layout for products subtree
    $productId.tsx    # Dynamic route ("/products/:productId")
    $productId/
      index.tsx       # "/products/:productId"
      reviews.tsx     # "/products/:productId/reviews"
  settings/
    route.tsx         # Pathless layout (no URL segment)
    profile.tsx       # "/settings/profile"
  [...catchAll].tsx   # Catch-all / 404 ("/*")
```

### Naming Rules

| Pattern | Example | Matches | Params |
|---------|---------|---------|--------|
| Static | `about.tsx` | `/about` | — |
| Index | `index.tsx` | `/` (or parent `/parent`) | — |
| Dynamic | `$productId.tsx` | `/products/123` | `{ productId: "123" }` |
| Catch-all | `[...catchAll].tsx` | `/*` | `{ catchAll: "path/to/match" }` |
| Pathless layout | `route.tsx` | (no segment) | — |

### Route Module Exports

```tsx
// src/routes/products/$productId.tsx
import { createFileRoute } from 'typed-router';
import { ProductDetail } from './ProductDetail';

export const route = createFileRoute('/products/$productId')({
  component: ProductDetail,
  loader: async ({ params }) => {
    const product = await fetchProduct(params.productId);
    return { product };
  },
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
import { routes } from 'typed-router:routes'; // Generated

function App() {
  return <Router routes={routes} />;
}
```

```tsx
// src/routes/index.tsx
import { createFileRoute } from 'typed-router';

export const route = createFileRoute('/')({
  component: () => <h1>Home</h1>,
});
```

## Typed Navigation

```tsx
import { Link, useNavigate, useParams } from 'typed-router';
import type { RouteParams } from 'typed-router:routes';

// Link with full type checking
<Link path="/products/$productId" params={{ productId: '123' }} /> // ✅
<Link path="/products/$productId" params={{ id: '123' }} />        // ❌ wrong param name
<Link path="/products/$productId" />                                // ❌ missing params
<Link path="/unknown" />                                            // ❌ route doesn't exist

// Imperative navigation
const navigate = useNavigate();
navigate({ path: '/products/$productId', params: { productId: '123' } });

// Typed params in components
const { productId } = useParams<'/products/$productId'>();
// or infer from current route
const params = useParams(); // { productId: string } | {}
```

## Commands

```bash
# Generate route tree and types (run before TypeScript check)
npx typed-router generate

# Dev server
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
  to="/plain/url"                    // Raw URL (no type checking)
  path="/products/$productId"        // Typed route pattern
  params={{ productId: '123' }}      // Required if path has params
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

## Type Safety Levels

| Level | Setup | Checks |
|-------|-------|--------|
| **0** | None | Plain `<Link to="...">` — works, no types |
| **1** | `path` + `params` | Internal consistency: params match path pattern |
| **2** | Wrapper component | Named routes, no union |
| **3** | **Generated union** | **Route existence, param names, param presence** |

Level 3 is the default when using the Vite plugin — the generated `RouteId` union enables full checking.

## Generated Files

The Vite plugin generates (do not edit manually):

```
src/
  typed-router.d.ts          # TypeScript declarations (RouteId, RouteParams, etc.)
  typed-router-routes.ts     # Route tree for runtime
  typed-router-routes.js     # Route tree (JS for runtime)
```

## License

MIT