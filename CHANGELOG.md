# Changelog

All notable changes to `clear-safe-router` are documented here.

## Unreleased

### Changed

- **`invalidate()` revalidates the whole matched chain.** Each target now re-runs
  the loaders of every matched route (parent layouts first, then the leaf), not
  only the leaf — a layout loader has its own cache key and its data is part of
  the page. Consequence for consumers of the result array: one call returns one
  entry per revalidated route, so a parent and the leaf can share the same
  `path`. Look results up by route identity, not by `path` alone.
  `submitRouteAction` revalidates the same way (it invalidates its own path with
  `force: true`).
- **`defaultPrefetchStaleTime` / route-level `prefetchStaleTime` removed** in
  favor of the `externalCache` route flag (and the `defaultExternalCache` router
  prop): a flagged route's cache entry is written with `staleTime: 0` — the
  router cache never claims freshness, the loader re-runs on every navigation
  and the external data cache decides whether the network is hit. The flag is
  declared on a section route and inherited by children (a child can opt out
  with `false`). See the "External data cache" recipe in the README.
- **`RouteMatch.key` removed** (dead field: cache keys come from `routeKey`, not
  from matches) and the `location` argument of `matchRoutes()` is now ignored —
  both are source-level breaks for external core consumers, acceptable in 0.x.

### Added

- `externalCache?: boolean` route option and `defaultExternalCache?: boolean`
  router prop (see above).
- `beforeLoad` guard hooks receive the navigation's `AbortSignal`
  (`BeforeLoadArgs`); a superseded navigation aborts in-flight guard work.
- `RouterRuntime.prefetch(target, signal?)` — abortable prefetch; render/viewport
  prefetches abort on teardown/leave-of-viewport, hover remains best-effort.
- Loader cache keys canonicalize search params (name-then-value stable sort) and
  `isSameLocation` compares search canonically — reordered same-name params are
  the same location and share one cache entry.
- `invalidate()` canonicalizes its target (trailing slashes, duplicate segments).
- Loader cache writes abort early when the caller's signal is already aborted.
- Polling catches `snapshot().data` up in place (same Map identity): the
  snapshot's data slice no longer diverges from the data store, and snapshot
  subscribers still do not re-render on polling ticks.

### Fixed

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
- `updateSearchParams` respects the blocker (charged → blocked with the target;
  blocked → ignored), commits `prevLocation` for the next navigation, mirrors the
  data slice into the snapshot, and re-arms polling/GC for the new location.
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
- `RouteMatch.key` removed (dead field: cache keys come from `routeKey`); a
  stale-only `invalidate()` now finds search-shallow-updated URLs (the copied
  value lands in the cache as a stale entry, not just in the data store).
- `splitLocation` strips `#hash` from targets instead of matching it as a path
  segment.
- Vite plugin route-file detection normalizes Windows/posix path separators.
- `browserEnv` resets `--pg-transition-duration` after a view transition and
  falls back gracefully for legacy engines that reject `behavior: 'instant'`.
