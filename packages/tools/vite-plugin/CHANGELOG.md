# @pyreon/vite-plugin

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.21.0

## 0.20.0

### Minor Changes

- [#659](https://github.com/pyreon/pyreon/pull/659) [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: P0 compile-time rocketstyle wrapper-collapse (opt-in `pyreon({ collapse: true })`)

  The vertical slice of the P0 RFC. A literal-prop rocketstyle call site
  (`<Button state="primary" size="medium">Save</Button>` — every dimension
  prop a string literal, no spread, static-text children) collapses from a
  5-layer wrapper mount (rocketstyle → attrs HOC → Element → Wrapper →
  styled) into ONE `_rsCollapse` cloneNode. E2 measured **44× wall-clock**,
  `mountChild` 9→1, `styler.resolve` 22→0. **OFF by default** — zero
  behaviour change unless `pyreon({ collapse: true })` is set.

  Parity is guaranteed BY CONSTRUCTION, not by reimplementing the
  rocketstyle chain in the compiler (RFC decision 2): the Vite plugin
  spins ONE programmatic Vite-SSR server bound to the consumer's own
  `vite.config`, renders the REAL component twice (light + dark), and
  captures the resolved class + styler rule text — the same
  `renderToString` + `@pyreon/styler` code path the app uses. Styler's
  FNV-1a class hash is identical SSR vs DOM (its hydration contract), so
  the build-resolved class is byte-for-byte the client-mounted class.

  New public surface (all additive):

  - `@pyreon/styler` — `StyleSheet.getStyleRules()` (raw SSR rule
    snapshot) + `StyleSheet.injectRules(rules, key)` (idempotent
    pre-resolved rule injection, no re-hash).
  - `@pyreon/runtime-dom` — `_rsCollapse(html, lightClass, darkClass,
isDark, bind?)` (one html-keyed `_tpl` cloneNode; class reactively
    bound to the live mode accessor — RFC decision 1 dual-emit, mode swap
    re-runs ONLY the className on the SAME node, no remount; decision 4
    hoisted-factory). `runtime-dom` stays layer-pure (never imports
    styler/ui-core — the styler injection is the emitted code's job).
  - `@pyreon/compiler` — `scanCollapsibleSites()` +
    `rocketstyleCollapseKey()` exports + `TransformOptions.collapseRocketstyle`.
    Detection + emission live ONLY in the JS path; `transformJSX`
    short-circuits to `transformJSX_JS` when the option is set (the Rust
    binary doesn't implement it). A SINGLE shared `detectCollapsibleShape`
    bail catalogue is used by both the plugin scan and the compiler emit
    so resolution keys can't drift.
  - `@pyreon/vite-plugin` — `pyreon({ collapse: true | PyreonCollapseOptions })`
    - `createCollapseResolver` (Vite-SSR resolver, memoised, disposed in
      `closeBundle`). Only the CLIENT graph collapses — the SSR graph keeps
      the real mount.

  Tested across 5 layers: styler `injectRules` (3 real-Chromium specs);
  `_rsCollapse` (4 real-Chromium specs — light class, mode-flip-no-remount,
  children dispose, shared parsed template); resolver vs the REAL
  `@pyreon/ui-components` Button via Vite SSR (8 specs incl. determinism +
  graceful bail on a non-existent export); compiler detection / emission /
  full bail catalogue / once-per-module dedupe (13 specs); end-to-end
  pipeline — real Button → resolver → scanner → compiler emits
  `__rsCollapse` carrying the real SSR-resolved classes + class-stripped
  template + rule bundle byte-for-byte. **Phase-4 RFC acceptance, real
  Chromium, shipped `_rsCollapse` × the REAL `@pyreon/ui-components` Button**
  (`examples/experiments/e2-static-rocketstyle/e2.browser.test.ts`, 2 specs):
  (1) the collapsed `<button>` is `isEqualNode`-structurally-identical to
  the real rocketstyle-mounted one with a char-for-char-equal `className`
  and identical computed style; (2) the perf signature is exactly
  `runtime.tpl ≥ 1` + `runtime.mountChild == 1` per Button (the real mount
  is 8–9 mountChild) with **~27× wall-clock** (collapsed 0.20 ms vs
  baseline 5.40 ms, in-suite benchmark). Additive guarantee: all 1079
  `@pyreon/compiler` tests pass unchanged with collapse off.

  Bisect-verified: disabling the compiler's `tryRocketstyleCollapse(node)`
  detection call fails the 4 collapse-emission specs (`expected … to
contain '__rsCollapse('`) while the 9 bail-catalogue / key-stability
  specs still pass; restored → 13/13.

  **Deliberately deferred (follow-up PRs, tracked in
  `.claude/plans/open-work-2026-q3.md` §P0):** an `examples/ui-showcase`
  build-with-collapse **verify-modes cell** (a build-artifact gate —
  ui-showcase's Buttons all carry `onClick` → correctly bail, so it needs
  a dedicated literal-prop demo route first; note the real-Chromium
  DOM-parity + perf-counter acceptance is NOT deferred — it ships here as
  the Phase-4 e2 specs above), and dev-mode collapse (build-shaped today —
  dev keeps the normal mount, graceful). The
  slice is fundamentally complete end-to-end (detect → resolve → emit →
  parity-proven); these extend coverage, they are not gaps in the
  mechanism. The RFC doc was removed once shipped — its decisions are now
  the code, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse".

### Patch Changes

- [#674](https://github.com/pyreon/pyreon/pull/674) [`2f38584`](https://github.com/pyreon/pyreon/commit/2f3858453c00e901b134dd4c15dad1eb3f793189) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon({ collapse: true })` is now correctly **build-only**. Pre-fix the rocketstyle-collapse `transform`-hook block was gated only `!isSsr`, so it also ran under `vite dev`: a leaked per-process nested Vite SSR server (its `closeBundle` teardown is a build-only Rollup hook) plus a class frozen against the user's theme-source HMR edits — strictly worse than the HMR-reactive normal mount.

  The block is now gated `if (collapseEnabled && isBuild && !isSsr)`. `vite dev` keeps the normal rocketstyle mount and the resolver is never constructed; the plugin surfaces the build-only contract once per dev process via `this.info` so an opted-in consumer isn't left wondering why nothing collapsed. Production `vite build` is unchanged. No public API change — `collapse` already behaved this way in build; this makes the dev no-op explicit, leak-free, and tested (stub-resolver bisect-verified `rocketstyle-collapse-dev.test.ts`).

- [#704](https://github.com/pyreon/pyreon/pull/704) [`e348599`](https://github.com/pyreon/pyreon/commit/e3485990cb52c414efb4217d40d3ed24e9c461b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(svelte-compat): new compat layer — Svelte importable runtime API on Pyreon

  `@pyreon/svelte-compat` is the fifth compat layer (alongside
  react / preact / vue / solid). It shims the Svelte APIs code actually
  `import`s, backed by Pyreon's signal-based reactive engine:

  - **`svelte/store`** — `writable`, `readable`, `derived` (single +
    array, sync + async/cleanup forms), `get`, `readonly`. Store contract
    (`subscribe(run, invalidate?) → unsubscribe`, lazy
    `start(set, update?) → stop` notifier with `0→1` / `1→0` semantics)
    matches Svelte exactly.
  - **`svelte`** — `onMount` (returned cleanup runs on destroy, per
    Svelte's contract), `onDestroy`, `beforeUpdate`, `afterUpdate`,
    `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
    `createEventDispatcher`, `mount`, `unmount`, `flushSync`.
  - Re-exports `For` / `Show` / `Switch` / `Match` / `Suspense` /
    `ErrorBoundary` for control-flow parity.

  Scope boundary (same as solid-compat draws around Solid's compiler):
  no `.svelte` SFC compiler, no Svelte 5 rune _syntax_
  (`$state` / `$derived` / `$effect` / `$store` sugar) — compiler
  constructs, not runtime imports. A component that subscribes to a store
  in its body is the faithful equivalent of `$store` auto-subscription:
  it re-renders on store change and auto-cleans on unmount.

  `@pyreon/vite-plugin` (patch): `pyreon({ compat: 'svelte' })` now
  aliases `svelte` / `svelte/store` → `@pyreon/svelte-compat` and routes
  JSX through the compat runtime.

  Covered by unit tests (51, coverage 97.7% stmts / 87.8% branch),
  real-Chromium browser smoke (4), and the compat-layers e2e gate
  (`examples/svelte-compat`, port 5182).

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

## 0.19.0

### Patch Changes

- [#596](https://github.com/pyreon/pyreon/pull/596) [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

  Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

  Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

### Minor Changes

- [#587](https://github.com/pyreon/pyreon/pull/587) [`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` now supports inline children — the compiler extracts the subtree into a proper chunk automatically.

  **Before (v1, PR [#585](https://github.com/pyreon/pyreon/issues/585))** — explicit `chunk` prop required:

  ```tsx
  <Defer chunk={() => import("./ConfirmModal")} when={open}>
    {(Modal) => <Modal onClose={() => setOpen(false)} />}
  </Defer>
  ```

  **After (this PR)** — inline children, compiler does the chunking:

  ```tsx
  import { Modal } from "./ConfirmModal";

  <Defer when={open}>
    <Modal />
  </Defer>;
  ```

  The compiler (`@pyreon/compiler`'s new `transformDeferInline`) detects `<Defer>` JSX with no `chunk` prop and a single bare component child, looks up that component's import, rewrites the JSX to use an explicit `chunk={() => import('./path')}` prop, and removes the static import so Rolldown actually emits a separate chunk.

  ## v1 scope (this PR)

  - Single Defer JSX element per file (multiple Defers in one file each get their own transform pass — works fine)
  - Child must be a single self-closing component element with **no props** (`<Modal />` ✓; `<Modal title="hi" />` falls back to the explicit form)
  - Named or default imports only — renamed imports (`{ Modal as M }`) and namespace imports (`* as M`) bail with a warning, user falls back to explicit form
  - The imported binding must NOT be used outside the Defer subtree (Rolldown would static-bundle the module and the dynamic import becomes a no-op; the compiler warns and bails when this is detected)
  - JS-fallback compiler path only — Rust compiler parity is a follow-up

  When the transform bails on any of the above, the user sees a soft warning at compile time. The `<Defer>` element is left unchanged; runtime then errors at chunk-load time because `chunk` is missing, prompting the user to use the explicit form.

  ## What's NOT in this PR

  - Closure capture (passing `count` signals or local state to the inline child) — requires prop-extraction analysis
  - Rust compiler implementation — JS fallback only
  - HMR for the synthetic chunk module — relies on Rolldown's standard dynamic-import HMR
  - TypeScript type-narrowing for the inline form — `<Defer>`'s props still type-check the explicit form; inline form passes through without type-narrowing the chunk relationship

  ## How it composes

  The transform runs in `@pyreon/vite-plugin`'s `transform()` hook BEFORE `transformJSX()`. By the time the JSX→runtime transform sees the source, the inline form has already been rewritten into the explicit chunk-prop form. No special-casing in the runtime, no new VNode shape, no new bundler hook — just AST rewriting before the existing pipeline.

  Verified via 13 unit tests (`@pyreon/compiler/src/tests/defer-inline.test.ts`) covering:

  - Basic rewrites: named/default imports, on="visible" / when={signal} triggers, props preservation
  - Bail-outs: chunk already provided, binding used elsewhere, child not imported, child has props, multiple children, syntax errors
  - Multi-Defer files: two independent Defers in one file get rewritten independently

  1004 `@pyreon/compiler` tests pass (13 new + 991 existing — no regressions).

  Depends on PR [#585](https://github.com/pyreon/pyreon/issues/585) (the runtime `<Defer>` primitive). Won't be useful until that merges.

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.16.0

## 0.14.0

### Minor Changes

- [#296](https://github.com/pyreon/pyreon/pull/296) [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Auto-call signals and computeds in JSX — plain JS syntax for reactivity. `const count = signal(0); <div>{count}</div>` compiles to `<div>{() => count()}</div>`. Scope-aware (shadowed variables not auto-called), cross-module (Vite plugin pre-scans exports), import-type-safe, computed-aware. 527 tests.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- feat(vite-plugin): auto-inject signal debug names in dev mode

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

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
  - @pyreon/compiler@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.3.1

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
  - @pyreon/compiler@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/compiler@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/compiler@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.1.1
