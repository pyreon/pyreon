# @pyreon/server

## 0.12.14

### Patch Changes

- [#253](https://github.com/pyreon/pyreon/pull/253) [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Storage / query / core-server anti-pattern cleanup + `no-window-in-ssr`
  typeof-guard-function recognition

  `@pyreon/storage` (10 errors → 0):

  - `indexed-db.ts`: added `typeof indexedDB === 'undefined'` early-return at
    `openDB` entry. SSR callers receive a rejected promise with a clear
    `[Pyreon] indexedDB is not available` error instead of crashing.

  `@pyreon/query` (5 errors → 0):

  - `use-subscription.ts`: added `typeof WebSocket === 'undefined'`
    early-return guards at the entry of `connect()`, `send()`, and `close()`.
  - `query-client.ts`: error prefix `[@pyreon/query]` → `[Pyreon]`.

  `@pyreon/server` / `@pyreon/core-server` (5 errors → 0):

  - `client.ts`: `typeof document === 'undefined' → throw` early-return on
    `startClient` entry. `hydrateIslands` and `scheduleHydration` /
    `observeVisibility` typeof guards.
  - `client.ts` / `html.ts`: error prefixes normalised to `[Pyreon]`.

  `@pyreon/lint` — `no-window-in-ssr` typeof-guard functions:

  - A function whose body is `return <typeof check>` (or AND-chain of typeof
    checks) now counts as a typeof guard at its call sites — e.g.
    `function isBrowser() { return typeof window !== 'undefined' }` makes
    `if (!isBrowser()) return` an early-return guard. Both
    `function decl` and `const fn = () => …` (arrow + function-expression)
    forms are recognised.
  - Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are
    pre-seeded so cross-module imports (`import { isBrowser } from './utils'`)
    work without follow-the-import analysis. Same name-convention basis as
    `dev-guard-warnings` recognising `__DEV__`. The trade-off — a user-defined
    function with a matching name that does NOT actually check typeof would
    silence the rule — is documented as the cross-module convention contract.

  5 new bisect-verified regression tests for the typeof-guard-function
  recognition.

- Updated dependencies [[`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6)]:
  - @pyreon/router@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/head@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14
  - @pyreon/runtime-server@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/head@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/router@0.12.13
  - @pyreon/runtime-dom@0.12.13
  - @pyreon/runtime-server@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/head@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/router@0.12.12
  - @pyreon/runtime-dom@0.12.12
  - @pyreon/runtime-server@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/head@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/router@0.12.11
  - @pyreon/runtime-dom@0.12.11
  - @pyreon/runtime-server@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2
  - @pyreon/runtime-server@0.7.2
  - @pyreon/router@0.7.2
  - @pyreon/head@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1
  - @pyreon/runtime-server@0.7.1
  - @pyreon/router@0.7.1
  - @pyreon/head@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/head@0.7.0
  - @pyreon/router@0.7.0
  - @pyreon/runtime-dom@0.7.0
  - @pyreon/runtime-server@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/router@0.6.0
  - @pyreon/head@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/runtime-server@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7
  - @pyreon/runtime-server@0.5.7
  - @pyreon/router@0.5.7
  - @pyreon/head@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/runtime-server@0.5.6
  - @pyreon/reactivity@0.5.6
  - @pyreon/router@0.5.6
  - @pyreon/head@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4
  - @pyreon/runtime-server@0.5.4
  - @pyreon/router@0.5.4
  - @pyreon/head@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3
  - @pyreon/runtime-server@0.5.3
  - @pyreon/router@0.5.3
  - @pyreon/head@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2
  - @pyreon/runtime-server@0.5.2
  - @pyreon/router@0.5.2
  - @pyreon/head@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/head@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1
  - @pyreon/runtime-server@0.5.1
  - @pyreon/router@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
  - @pyreon/head@0.5.0
  - @pyreon/router@0.5.0
  - @pyreon/runtime-server@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Minor Changes

- ### @pyreon/router

  - `go(n)` and `forward()` for history navigation
  - Named `replace()` — navigate by route name
  - Optional params (`:id?`) with compile-time type inference
  - `isReady()` promise for initial navigation
  - `onBeforeRouteLeave` / `onBeforeRouteUpdate` in-component guard composables
  - Route aliases — render same component from multiple paths
  - Base path support for sub-path deployments
  - Navigation blockers (`useBlocker`)
  - Relative navigation from current route
  - Trailing slash normalization (strip/add/ignore)
  - Typed search params (`useSearchParams`)
  - Stale-while-revalidate loaders

  ### @pyreon/head

  - Cached resolve with dirty flag (30M+ ops/sec cached path)
  - Single-pass HTML escaping (regex + lookup table)
  - DOM element tracking via Map (avoids querySelectorAll per sync)
  - 7-9.5x faster SSR serialization than Unhead (Vue/Nuxt)

  ### @pyreon/server

  - Pre-compiled template splits at handler creation (17x faster on real templates)
  - Pre-built client entry tag avoids per-request string construction
  - `buildScriptsFast` skips array allocation
  - Template validation moved to `createHandler` time
  - New exports: `compileTemplate`, `processCompiledTemplate`, `CompiledTemplate`

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.4.0
  - @pyreon/head@0.4.0
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0
  - @pyreon/runtime-server@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1
  - @pyreon/router@0.3.1
  - @pyreon/runtime-server@0.3.1
  - @pyreon/head@0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0
  - @pyreon/runtime-dom@0.3.0
  - @pyreon/runtime-server@0.3.0
  - @pyreon/router@0.3.0
  - @pyreon/head@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1
  - @pyreon/runtime-dom@0.2.1
  - @pyreon/runtime-server@0.2.1
  - @pyreon/router@0.2.1
  - @pyreon/head@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-dom@0.2.0
  - @pyreon/runtime-server@0.2.0
  - @pyreon/router@0.2.0
  - @pyreon/head@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2
  - @pyreon/runtime-server@0.1.2
  - @pyreon/router@0.1.2
  - @pyreon/head@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/head@0.1.1
  - @pyreon/router@0.1.1
  - @pyreon/runtime-dom@0.1.1
  - @pyreon/runtime-server@0.1.1
