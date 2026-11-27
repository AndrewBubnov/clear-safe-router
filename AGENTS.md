# AGENTS.md

Guidance for coding agents working in this repository.

## Project

Clear Safe Router is a provider-free React SPA router with file-based routing
and compile-time type-safe navigation. It has a framework-free kernel, a React
adapter, and a Vite plugin that generates the route tree and route registry.

- Package: `clear-safe-router` (`0.1.x`, ESM, Node >= 18)
- Runtime dependencies: none. React is a peer dependency.
- Main docs: `README.md`
- Playground: `playground/` (the main manual test app)

## Start Here

Read these before changing architecture or public types:

- `README.md` — user-facing behavior and route conventions
- `src/core/index.ts` — curated public surface of the headless core
- `src/core/env.ts` — the platform seam (`RouterEnv`)
- `src/browser-env.ts` — browser implementation of `RouterEnv`
- `src/runtime/index.ts` — React adapter wiring
- `src/types.ts` — React-facing types; re-exports core types
- `scripts/generate-routes.mjs` — file-based route generator
- `tests/unit/headless.env.test.ts` — proof that the core runs without DOM
- `tests/types/routes.test.tsx` — public type-level contract

## Commands

Run commands from the repository root.

```bash
npm install

# Development
npm run dev                 # generate routes + start playground on Vite
npm run router:generate     # regenerate playground/routeTree.gen.ts
npm run generate            # alias for router:generate

# Verification
npm run typecheck           # generate + tsc -b + public type tests
npm run lint                # eslint .
npm test                    # generate + vitest run
npm run test:coverage       # generate + vitest with coverage
npm run test:e2e            # Playwright; starts the playground dev server

# Build
npm run build:lib           # clean dist, build library JS + declarations
npm run build:playground    # generate + build playground only
npm run build               # playground build + library build
npm run prepublishOnly      # typecheck + test + build:lib + smoke-pack
```

For core-only changes, also run the no-DOM compile:

```bash
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler \
  --strict --skipLibCheck --lib ES2022 --types node src/core/index.ts
```

## Architecture

```text
src/
  core/                 framework-free kernel: matching, state, cache, loaders,
                        guards, actions, scroll, polling, RouterEnv
  core-entry.ts         thin build entry for the ./core subpath; no logic here
  browser-env.ts        DOM implementation of RouterEnv; shared by adapters
  runtime/              React adapter: hooks, env wiring, core re-exports
  route/                React route definitions, lazy components, Outlet
  router.tsx            React <Router>
  link.tsx              React <Link>
  hooks.ts              React hooks
  types.ts              React-facing types; re-exports core types
  index.tsx             public root barrel for the React package
  vite-plugin/          Vite plugin that invokes the route generator

scripts/
  generate-routes.mjs   file-system -> routeTree.gen.ts + TypedRouterRouteMap

playground/             demo app; routeTree.gen.ts is generated and tracked
tests/
  unit/                 Vitest unit/parity tests
  integration/          Vitest integration tests
  types/                compile-time public API tests
  e2e/                  Playwright tests against the playground
```

### Core vs adapter boundary

- `src/core` must stay framework-free: no React, no DOM lib, no Vite, no
  `import.meta`, no `window`/`document`/`history` runtime access.
- All platform access goes through `RouterEnv` from `src/core/env.ts`.
- `src/browser-env.ts` is the only browser platform implementation in the
  library. It may use `window`, `document`, and DOM types.
- `src/runtime` is the React adapter. It wires `browserEnv`, hooks, and the
  adapter-specific prefetch hook.
- Core types must not depend on React or DOM types. Use structural types for
  platform shapes (see `EnvScrollElement`).
- Keep view-specific behavior out of core. Lazy component warming is wired via
  `routerConfig.onPrefetch` in the React adapter, not implemented in core.

When adding a `RouterEnv` method, update all implementations:

1. `RouterEnv` in `src/core/env.ts`
2. `nullEnv` in `src/core/env.ts`
3. `browserEnv` in `src/browser-env.ts`
4. Memory envs in tests (for example `tests/unit/headless.env.test.ts`)

## Public API and Packaging

Public subpaths:

- `clear-safe-router` — React API (`src/index.tsx`)
- `clear-safe-router/core` — headless kernel (`src/core/index.ts`)
- `clear-safe-router/browser-env` — browser `RouterEnv` (`src/browser-env.ts`)
- `clear-safe-router/vite` — Vite plugin (`src/vite-plugin/index.ts`)

Rules:

- Preserve the existing root API. Prefer additive changes; breaking changes
  require a major version.
- Keep `src/core/index.ts` curated. Do not export raw internals such as cache
  maps, refs, or listener sets from the public core barrel. In-package code may
  use deep imports; external code should use the barrel.
- The route registry `TypedRouterRouteMap` lives in `src/core/types.ts`.
  `scripts/generate-routes.mjs` augments `clear-safe-router/core`. Do not change
  the augmentation target back to the root module without a packaged-consumer
  type test.
- `src/types.ts` re-exports core types for the React API. If a type should be
  public from the root, add it to the export list in `src/types.ts`.
- `src/index.tsx` is the root public barrel. Keep its named exports stable.
- When adding a new package subpath, update:
  - `package.json` → `exports`
  - `vite.lib.config.ts` → `build.lib.entry`
  - `tsconfig.build.json` → `include` if needed for declaration emit
  - README / `llms.txt`
- `src/core-entry.ts` exists only so Rollup can emit a stable `./core` entry;
  the kernel itself is shared as `kernel.js`. Do not put implementation there.

### Runtime globals

- `RouterEnv` is process-global: one adapter per process.
- The React adapter installs `browserEnv` only when the current env is still
  `nullEnv` and a DOM exists. A host that installed its own env before importing
  the adapter keeps it.
- `routerConfig.onPrefetch` is a single global adapter hook. Do not run multiple
  adapters with different prefetch behavior in one process.
- `routerConfig.warnOnUnmatchedRoutes` defaults to `false`. The React adapter
  enables it from the bundler dev flag; core must not detect dev mode itself.

## Route Generation

- Route files live in the configured routes directory. The playground uses
  `playground/routes` and generates `playground/routeTree.gen.ts`.
- `playground/routeTree.gen.ts` is generated and tracked. Regenerate it when
  route files change; never hand-edit it.
- The generator validates the required `__root.tsx`, unique route IDs, dynamic
  parameter names, and route-file shape.
- The Vite plugin runs the generator on dev-server start, build start, and
  route-file add/remove events. Content-identical output must not trigger a full
  reload.
- File conventions: `__root.tsx`, `index.tsx`, `route.tsx`, `$param.tsx`,
  `$.tsx` (catch-all). See `README.md` for the full table.

## Testing

- Vitest default environment is `jsdom`.
- Core-only tests must use `// @vitest-environment node` and must not import the
  React adapter or `browser-env` unless the test is specifically about browser
  wiring.
- In core tests, install a memory `RouterEnv`, call `resetRouterState()` between
  tests, and restore `nullEnv` afterwards. `resetRouterState()` does not reset
  `RouterEnv` or `routerConfig`; restore those explicitly.
- Add core behavior tests in Node when possible. Use jsdom/React tests for the
  adapter and rendering behavior.
- Public type tests live in `tests/types/` and are run by `npm run typecheck`.
  They use source path aliases; when changing package types, also verify a
  packaged consumer if practical (`npm pack` + temporary consumer).
- E2E tests run against the playground via Playwright (`npm run test:e2e`).

## Code Conventions

- ESM, TypeScript strict mode, React 18+ peer.
- Follow the existing style of the file you are editing; the core and adapter
  use slightly different quote/formatting conventions.
- Keep changes focused. Avoid drive-by refactors, renames, or formatting churn.
- Prefer existing stores, helpers, and types over new abstractions.
- Add comments only for non-obvious invariants, platform seams, or compatibility
  behavior; do not narrate obvious code.
- Do not add runtime dependencies without a strong reason.
- Do not commit `dist/`, `dist-playground/`, coverage, Playwright reports, or
  test results.

## Definition of Done

For a normal change:

```bash
npm run typecheck
npm run lint
npm test
```

Also run:

- `npm run build:lib` for library, packaging, or public type changes
- `npm run test:e2e` for router, playground, or user-flow changes
- the core no-DOM compile and headless tests for any `src/core` change

Before finishing, check that generated files are consistent and that the public
root API has not changed unintentionally.
