# Navigation, blocking, invalidation, actions

## useNavigate

```tsx
const navigate = useNavigate();
navigate('/users/42');                    // string ('-1' = history back)
navigate({ to: '/users', search: '?sort=asc' });   // search carries its leading '?'
navigate({ to: '/users/$userId', params: { userId: '42' } }); // typed, checked against the route tree
navigate({ to: '/users', replace: true });
navigate(-1);                             // browser back
```

`NavigateTarget` is typed against the generated route registry — an unknown
`to`/params shape fails at compile time. `search` carries its leading `?`
everywhere downstream (Location, cache keys). The navigate call resolves the
target through the same pipeline as a `<Link>` click: guards, loader, blockers.

## Blocking (useBlocker)

```tsx
const { state, proceed, reset } = useBlocker(({ location, nextLocation, context }) => dirty);
// state: 'unblocked' → 'charged' (armed) → 'blocked' (a navigation was intercepted)
```

The callback returns whether navigation should be blocked — re-evaluated after
every commit, so plain booleans work. When armed, the next navigation (links,
programmatic, browser Back) suspends; show a dialog on `state === 'blocked'`,
then `proceed()` to continue to the target or `reset()` to stay armed. Use for
dirty forms. The armed state is owned by the most recently mounted blocker
hook; search-param changes count as navigations and are blockable too.

## Invalidation (useInvalidate)

```tsx
const invalidate = useInvalidate();
await invalidate();                 // current route
await invalidate('/users');         // concrete path
await invalidate('/users/:id');     // pattern → every matching cache entry
await invalidate(['/a', '/b']);     // several targets
await invalidate(undefined, { withChildren: true }); // extend to nested routes
await invalidate(undefined, { staleOnly: true }); // mark stale, refetch lazily
```

Invalidation re-runs the loaders of the whole matched chain (parent layouts
first, then the leaf — a layout loader has its own cache key); only results
matching the currently active `pathname + search` update the on-screen data.
The target is canonicalized (trailing slashes, duplicate segments).
Invalidations issued in the same turn (chained awaits, several calls in one
handler, a parent and its child listed together) share one loader run per
cache key — beyond the loads the route's own navigation performs. Use for
post-mutation refreshes; `useSubmitAction` triggers dependent invalidations
automatically.

## Prefetch

Router prop `defaultPrefetch: 'hover' | 'viewport' | 'none'` (device-aware
default: viewport on touch, hover on desktop). `<Link>` options: `prefetch`
(per-link override), `hoverPrefetchDelay` (ms, default 150).
Concurrency: 4 desktop / 2 touch. A prefetch is never a superseder: it rides an
already running flight for the same key and never aborts it — safe to hover
aggressively. Route guards can veto prefetching (`beforeLoad` receives the
prefetch attempt's own signal).

## Actions (mutations)

```tsx
// Route options
actions: ({ params, context, setContext }) => ({
	saveNote: async data => { ... },
}),
// Component — one hook per action
const { submit, isSubmitting, data, error } = useSubmitAction('saveNote', {
	onSuccess, onError, autoReset,
});
await submit(payload); // runs the action, then invalidates affected cache
```

Actions are route-owned mutations; after a successful action the affected
loader data is invalidated so the UI reflects the mutation without manual
refreshes.

## Scroll restoration

Route option `scrollRestoration: true` (window) or an array of container ids
(`'feed'`, `'gallery'`). Router prop `defaultScrollRestorationBehavior:
'auto' | 'smooth' | 'instant'`. Paired with browser history so Back restores
the scroll position of the previous entry; the `useRestoreScroll()` hook is
available for manual triggers.

## View transitions (adapter extra)

`isAnimated` / `animationDuration` on `<Router>` wrap navigations in a
`document.startViewTransition` when the env provides one, with a CSS-variable
transition duration set per navigation.
