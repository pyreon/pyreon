# @pyreon/runtime-dom

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1

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

## 0.2.0

### Minor Changes

- Release 0.2.0

  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
