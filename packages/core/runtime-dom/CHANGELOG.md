# @pyreon/runtime-dom

## 0.14.0

### Patch Changes

- [#312](https://github.com/pyreon/pyreon/pull/312) [`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a known-slot fast path to `mountFor`'s LIS reconciler that fires when `tails[v] === v`. This eliminates all binary-search probes on prepend-heavy patterns (`items.set([...newRows, ...items()])` — infinite-scroll feeds, chat history prepends, log tails) and cuts probes ~40-56% on random shuffles. Pure algorithmic optimization; no behavior change. Measured: 1k prepend 9 978 → 0 LIS probes, 1k random shuffle 5 117 → 2 255-2 982 probes across 5 seeds.

- [#314](https://github.com/pyreon/pyreon/pull/314) [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the two perf-harness instrumentation blind spots. Adds 7 dev-mode SSR counters (`runtime-server.render`, `.stream`, `.component`, `.escape`, `.suspense.boundary`, `.suspense.fallback`, `.for.keyMarker`) to `@pyreon/runtime-server` and the `runtime.tpl` counter (cloneNode fast-path invocation count) to `@pyreon/runtime-dom`. All gated on the appropriate dev check so zero production cost — measured overhead on a 1k-row SSR render is ~5% in dev with a sink installed, within noise without. The SSR emit contract is verified by 10 probe tests covering shape (exact counts), scaling (1k and 10k rows, no quadratic emits), escape density, and server-side runtime gating. The `runtime.tpl` counter is verified by 2 probe tests plus the existing Vite tree-shake regression guard.

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): make `innerHTML` and `dangerouslySetInnerHTML` reactive

  The JSX compiler wraps prop expressions containing signal reads in
  `_bind`-style `() => …` accessors. The runtime's `applyProp` checked for
  the `innerHTML` / `dangerouslySetInnerHTML` keys BEFORE checking if the
  value was a function, so the closure was stringified and set as literal
  text — `innerHTML={getIcon(props.x ? "moon" : "sun")}` rendered the
  literal text `() => getIcon(props.x ? "moon" : "sun")` in the DOM
  instead of the SVG.

  Fix: when `value` is a function, wrap in `renderEffect` so the accessor
  is called and the result is set as HTML on each tracked-signal change.
  Same treatment for `dangerouslySetInnerHTML` (function returns
  `{ __html: string }`).

  Found via bokisch.com `/resume` route — the symptom was literal closure
  text in icon SVG slots, plus a render loop that consumed several GB of
  RAM (the closure-as-string DOM mutation triggered re-evaluations).

  2 new regression tests in `packages/core/runtime-dom/src/tests/props.test.ts`.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): cancel in-progress transitions on unmount

  `<Transition>` and `<TransitionGroup>` added a 5-second safety timer to
  their enter/leave/move callbacks (so CSS transitions that never fire
  don't leak listeners). Without a matching cancel on component unmount,
  that timer kept running after the component was detached — firing
  `onAfterEnter` / `onAfterLeave` on now-detached elements up to 5 seconds
  later.

  Fix:

  - `<Transition>`: track `pendingEnterCancel` (parallel to the existing
    `pendingLeaveCancel`). `onUnmount` calls both to tear down listeners,
    clear safety timers, and strip active-state classes WITHOUT firing
    the onAfterX callback.
  - `<TransitionGroup>`: each `ItemEntry` gains a `cancelTransition`
    function that applyEnter / applyLeave / startMoveAnimation install.
    Container `onUnmount` iterates entries and cancels in-progress
    transitions before tearing down each entry's DOM.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): add safety timeout to `<TransitionGroup>` enter/leave/move

  `TransitionGroup`'s per-item `applyEnter` / `applyLeave` /
  `startMoveAnimation` added `transitionend` / `animationend` listeners
  with `{ once: true }` but had NO safety timeout — unlike the matching
  code in `transition.ts`.

  If a CSS transition never fires (off-screen element, zero-duration,
  `display: none`, visibility: hidden), the `done` callback never runs,
  `onAfterLeave` never fires, and `entries.delete(key)` is never called —
  **the item stays in the `entries` Map forever.** Real memory leak that
  grows with every list mutation; the impact compounds in long-running
  SPA sessions where list items cycle in and out frequently.

  Fix: added a 5-second safety `setTimeout` (same pattern as
  `transition.ts`). When CSS never fires, the timer forces the cleanup.

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7

## 0.5.6

### Patch Changes

- feat(dx): comprehensive `__DEV__` warnings across core and runtime-dom

  feat(style): auto-append `px` to numeric style values (e.g. `{ height: 100 }` → `"100px"`), with shared `CSS_UNITLESS` set for hydration consistency

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/reactivity@0.5.0

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
