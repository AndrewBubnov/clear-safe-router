# Search params as URL state

`useSearchParams()` treats the query string as application state owned by the
router. This is the pattern for table filters, sorting and pagination.

```tsx
const { searchParams, getSearchParams, setSearchParams } = useSearchParams();

searchParams.toString();                    // raw URLSearchParams
getSearchParams('brand');                   // 'nike' | ['nike', 'reebok'] | null
setSearchParams('page', '2');               // single value
setSearchParams('brand', ['nike', 'reebok']); // multi-value (appends)
setSearchParams(prev => { prev.set('page', '2'); return prev; }); // functional update
```

`getSearchParams` returns `null` for a missing key (deliberate extension over
the original router's `''` placeholder), `string` for single values, `string[]`
for repeated keys.

## Semantics — read this before writing UI code

- **`setSearchParams` is a full navigation.** It pushes a history entry and
  re-runs the route `loader` with the new `pathname + search`. This is the
  router's whole model: every query combination is a first-class, independently
  cached navigation.
- **Cache is per `pathname + search`.** Toggling sort A→B→A reuses the cache
  for A on the second visit (within `staleTime`) — instant, no loader call.
  Pair this with `keepPreviousData: true` so unseen combinations keep the
  current rows on screen.
- **Identical parameters are a no-op** (no duplicate history entry, no loader
  call).
- **Back/Forward walks the filter history**, and every entry has its own cached
  data.
- Blockers and `beforeLoad` see search-param changes like any navigation
  (search-only updates run the same pipeline as `<Link>` clicks).

## Real case: a server-driven table

The playground's search page (`playground/pages/SearchPage.tsx`) is the
reference implementation. Shape to copy:

- Controls (`setSearchParams`) write the URL: `q`, `sort`, `dir`, `page`,
  multi-value `brand`.
- The loader reads `location.search` and returns the already
  filtered/sorted/paginated page of rows (manual-mode TanStack Table; the
  table instance is a pure renderer).
- Route: `loader` + `staleTime` + `keepPreviousData: true` + `pendingFallback`.

```tsx
// Server-side multi-value filter: read the raw search, not the collapsed object.
loader: ({ location }) => {
	const brands = new URLSearchParams(location.search).getAll('brand');
	return fetchRows({ brands, search: location.search });
};
```

## Common mistakes

- **Debouncing per keystroke.** Each `setSearchParams` is a navigation; commit
  on Enter/blur or debounce deliberately. Typing `q` letter-by-letter creates a
  history entry and a loader flight per key.
- **Setting state from the loader back into params.** The URL is the single
  source of truth for query state; components read, they don't mirror.
- **Forgetting page reset.** Changing a filter while on page 4 leaves
  `page=4` — reset the page param whenever the result set changes shape.
- **Writing `history.replaceState` directly** to "just update the search" —
  this desynchronizes the router store from the URL (loader never re-runs,
  blockers bypassed). Always go through `setSearchParams` / `navigate`.
