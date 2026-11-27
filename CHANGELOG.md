# Changelog

All notable changes to `clear-safe-router` are documented here.

## 1.0.1

### Fixed

- The invalidation miss dev warning now covers both kinds of a silently
  no-op `invalidate()`: an explicit target that matches no route at all
  (e.g. a typo — previously it returned without any report), and a cache-only
  target (a pattern, `force: false` or `staleOnly`) that matched no cached
  entries. Both report via `console.warn` under `warnOnUnmatchedRoutes`.

### Verified

- Chain dedup regression test added: one `invalidate(['/parent', '/parent/id'],
  { withChildren: true })` call re-runs the shared parent layout loader once,
  not per target (`tests/unit/invalidate.chain.test.tsx`).
- Playground: the animated icon wrapper (a `div`) no longer nests inside a
  `<p>` on the external-cache page (React dev warning).

## 1.0.0

### Changed

- **`setSearchParams` is a full navigation.** It now pushes a history entry and
  re-runs the route loader with the updated search params (previously it was a
  `replaceState`-based shallow update that kept the loader data in place).
  Loader data is cached per `pathname + search`, so revisiting a parameter
  combination renders from cache. Identical parameters are a no-op (no
  duplicate history entry). For a loader re-run without a history entry, use
  `useInvalidate()`. The blocker contract, guards, scroll handling and
  polling/GC re-arming are inherited from the standard navigation pipeline.
- **`invalidate()` revalidates the whole matched chain.** Each target now re-runs
  the loaders of every matched route (parent layouts first, then the leaf), not
  only the leaf — a layout loader has its own cache key and its data is part of
  the page. Consequence for consumers of the result array: one call returns one
  entry per revalidated route, so a parent and the leaf can share the same
  `path`. Look results up by route identity, not by `path` alone.
  `submitRouteAction` revalidates the same way (it invalidates its own path with
  `force: true`).
- **Same-turn invalidations share one loader run per cache key.** Chained
  `await invalidate()` calls, several calls in one handler, or a target list
  naming a parent and its child each produce a single refetch: later calls ride
  the first run's fresh result instead of deleting it and fetching again.
  Revalidation from a later turn (new user action, focus/online) refetches
  normally.
- **`defaultPrefetchStaleTime` / route-level `prefetchStaleTime` removed** in
  favor of the `externalCache` route flag (and the `defaultExternalCache` router
  prop): a flagged route's cache entry is written with `staleTime: 0` — the
  router cache never claims freshness, the loader re-runs on every navigation
  and the external data cache decides whether the network is hit. The flag is
  declared on a section route and inherited by children (a child can opt out
  with `false`). See the "External data cache" recipe in the README.
- **`RouteMatch.key` removed** (dead field: cache keys come from `routeKey`, not
  from matches) and the `location` argument of `matchRoutes()` is now ignored —
  both are source-level breaks for external core consumers, shipped before the
  1.0.0 API freeze.

### Added

- `externalCache?: boolean` route option and `defaultExternalCache?: boolean`
  router prop (see above).
- `keepPreviousData?: boolean` route option: while the loader for a new
  `pathname + search` key is pending, the value committed for the same route
  under the previous location stays on screen instead of the pending fallback
  (same element by construction, error views still replace it on failure). The
  playground's data-table demo is built on it.
- `beforeLoad` guard hooks receive the navigation's `AbortSignal`
  (`BeforeLoadArgs`); a superseded navigation aborts in-flight guard work.
- `RouterRuntime.prefetch(target, signal?)` — abortable prefetch; render/viewport
  prefetches abort on teardown/leave-of-viewport, hover remains best-effort.
- Loader cache keys canonicalize search params (name-then-value stable sort) and
  `isSameLocation` compares search canonically — reordered same-name params are
  the same location and share one cache entry.
- `invalidate()` canonicalizes its target (trailing slashes, duplicate segments).
- Hidden-children dev warning: `routerConfig.warnOnHiddenChildren` (the React
  adapter enables it from the bundler dev flag, like
  `warnOnUnmatchedRoutes`). A matched parent route whose component never
  renders `<Outlet />` silently hides every route below it — the warning names
  the parent id, the URL and the hidden child.
- Invalidation miss dev warning: a cache-only target (a pattern, `force: false`
  or `staleOnly`) that matched no cached routes reports it via
  `console.warn` under `warnOnUnmatchedRoutes` instead of silently doing
  nothing.
- `npm run smoke-pack` (also chained into `prepublishOnly`): packs the
  package, extracts the tarball and verifies that every `exports` target and
  every package-relative path referenced from dist code actually ships — the
  release check that would have caught the broken 0.1.8 tarball.
- Loader cache writes abort early when the caller's signal is already aborted.
- Polling catches `snapshot().data` up in place (same Map identity): the
  snapshot's data slice no longer diverges from the data store, and snapshot
  subscribers still do not re-render on polling ticks.

### Fixed

- **Packaging: the route generator is shipped in the tarball.** The Vite plugin
  spawns `scripts/generate-routes.mjs` from the package root, but the `files`
  allowlist did not include it — a freshly installed package failed on
  `npm run dev`/`build` with a missing-module error until the consumer vendored
  the generator manually.
- **Packaging: the phantom dependency is gone.**
  `@tanstack/react-table` sat in `dependencies` while only the playground uses
  it — every consumer installed ~120 kB the library never imports. It moved to
  `devDependencies`; the package has no runtime dependencies.
- `navigate(-1)` is now usable in synchronous (memory) environments: the
  `back()`/`forward()` env contract is documented — a traversal must end with an
  `onPopState` callback.
- A guard redirect chain exceeding the redirect limit surfaces as an explicit
  `RedirectLoopError` instead of a silent route error.
- `afterLoad` hooks receive the committed `location` (including `prevLocation`)
  and their failures log the route id.
- `beforeLoad` guards receive the same `location` shape as `afterLoad` (with
  `prevLocation`).
- `Link` no longer crashes the render tree on a missing route parameter — it
  degrades to a disabled anchor with a warning.
- Polling compares locations canonically (a search reorder is not a departure).
- An abort during a retry delay resolves quietly instead of polluting the error
  maps with the original loader error.
- A superseded or aborted loader flight no longer emits a spurious notification;
  GC deletes update the cache snapshot.
- Popstate suppression during a blocker revert is a queue: a second history move
  cannot swallow the wrong event.
- `useBlocker` ownership is fixed at mount order — a re-render of a non-owner
  blocker can no longer steal ownership from the real one.
- Dead props `defaultLoaderFallback`/`defaultErrorElement` removed (use
  `pendingFallback`/`errorFallback` on `<Router>`).
- `splitLocation` strips `#hash` from targets instead of matching it as a path
  segment.
- Vite plugin route-file detection normalizes Windows/posix path separators.
- `browserEnv` resets `--pg-transition-duration` after a view transition and
  falls back gracefully for legacy engines that reject `behavior: 'instant'`.
