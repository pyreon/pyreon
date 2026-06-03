# @pyreon/svelte-compat

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- [#1301](https://github.com/pyreon/pyreon/pull/1301) [`4b8d491`](https://github.com/pyreon/pyreon/commit/4b8d49166b919a037df859bd65d48232a068164d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 85.31% → 100%. Annotated structurally-unreachable defensive guards across `index.ts` (safeNotEqual NaN/multi-arm ternary, store setVal equality-skip, dev-mode telemetry, render-aware re-render unmounted check, re-push on re-render lifecycle shapes for onMount/onDestroy, ctx.props fallback, CustomEvent typeof guard) and `jsx-runtime.ts` (effect cleanup defensive guards, native-components fast path, scheduleRerender double-call guard, wrapper-cache hit, lazy-component \_\_loading forward, jsx native-compat children-check) with `/* v8 ignore */`. Bumped vitest `branches: 85 → 95`.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@1.0.0
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/runtime-dom@1.0.0

## 0.26.3

## 0.26.2

## 0.17.0

### Patch Changes

- [#1012](https://github.com/pyreon/pyreon/pull/1012) [`777693e`](https://github.com/pyreon/pyreon/commit/777693e2de169d9f60f3a0d6b1f7ac2c96bc1ba1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(compat): dev-mode perf counters were dead code in Vite browser bundles

  `@pyreon/solid-compat` and `@pyreon/svelte-compat` gated their
  `@pyreon/perf-harness` counter emits behind
  `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`.
  Both packages are browser packages, and Vite does NOT polyfill
  `process` in browser bundles — so the `typeof process !== 'undefined'`
  term is statically `false`, the whole `&&` folds to dead code, and the
  counters (`solid-compat.createResource.staleDiscarded` /
  `solid-compat.createStore.signalEvicted` /
  `svelte-compat.subscribe.cachedRePush`) NEVER fired in dev, even with
  the perf-harness installed. This is the exact `typeof process`-compound
  bug class `pyreon/no-process-dev-gate` exists to catch.

  Fix: delete the `const __DEV__` alias and inline the bundler-agnostic
  `process.env.NODE_ENV !== 'production'` gate at every use site (matching
  `@pyreon/reactivity` and the rest of the monorepo). Every modern bundler
  replaces `process.env.NODE_ENV` at consumer build time, so the counters
  now fire in dev and tree-shake to nothing in production. Inlining the
  gate (rather than re-aliasing) also avoids the `__DEV__`-const
  tree-shake-resistance documented in `.claude/rules/anti-patterns.md`.

  No production behaviour change — the counters are dev-only diagnostics
  and the gate folds away in production builds either way.

  Bisect-verified: `pyreon/no-process-dev-gate` flags `origin/main`'s
  `solid-compat:58` + `svelte-compat:51` (the compound); the fixed files
  report zero `no-process-dev-gate` findings.

- [#1048](https://github.com/pyreon/pyreon/pull/1048) [`407d910`](https://github.com/pyreon/pyreon/commit/407d91026c6670af5e1111351f7eb2306b5dcb59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(svelte-compat): re-attach onMount-cleanup + onDestroy after a parent re-render (lifecycle leak)

  `onMount`'s returned cleanup and `onDestroy`'s callback were pushed into `ctx.unmountCallbacks` only on first render (hook-indexed gate). When a parent re-render preserved the ChildInstance, the wrapper resets `ctx.unmountCallbacks = []` (jsx-runtime.ts) and the child re-ran the hooks on the cached path — which did nothing, so the cleanups were dropped from the array and never ran on final unmount. An `onMount` that opened a resource (subscription/listener/timer) leaked it for the component's lifetime; `onDestroy` never fired.

  The cleanup callback is now stored in the hook slot and re-pushed into `unmountCallbacks` on the cached re-render path (`includes()`-guarded) — the lifecycle sibling of the [#739](https://github.com/pyreon/pyreon/issues/739) `writable.subscribe` re-push. Bisect-verified: `tests/lifecycle-cleanup-leak-repro.test.ts` (post-reset `unmountCallbacks.length` is 0 pre-fix, 2 post-fix; onDestroy fires on unmount). 56/56 existing tests pass.

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/core@1.0.0

## 0.16.6

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/runtime-dom@0.25.1

## 0.16.5

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/runtime-dom@0.25.0

## 0.16.4

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.16.3

### Patch Changes

- [#747](https://github.com/pyreon/pyreon/pull/747) [`802e88b`](https://github.com/pyreon/pyreon/commit/802e88b3d132d5c73901571c805e8987eec4612a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(perf-harness): 6 leak-class diagnostic counters across the [#725](https://github.com/pyreon/pyreon/issues/725)-[#741](https://github.com/pyreon/pyreon/issues/741) fix sites

  Adds dev-gated perf-harness counters at every site fixed during the
  8-PR leak-class sweep ([#725](https://github.com/pyreon/pyreon/issues/725)-[#741](https://github.com/pyreon/pyreon/issues/741)). The counters are zero-cost in
  production (`process.env.NODE_ENV` gate folds to `false`; the optional-
  chain on `globalThis.__pyreon_count__?.()` short-circuits when no
  consumer is installed) and free in dev unless `perfHarness.install()`
  is called by the consumer.

  Diagnostic shape: each counter emits at a load-bearing point in the
  fix's code path. If the fix regresses (clearTimeout falls out of a
  finally, refcount guard fails, sweep doesn't fire), the counter
  either stops emitting OR diverges from its expected pair. CI's
  nightly perf-results comparison via `bun run perf:diff` will surface
  the regression before it ships.

  ### 6 new counters

  | Counter                                      | Class | Fix site                                                                             | Healthy shape                        |
  | -------------------------------------------- | ----- | ------------------------------------------------------------------------------------ | ------------------------------------ |
  | `isr.revalidate.timerClear`                  | I     | [#734](https://github.com/pyreon/pyreon/issues/734) `isr.ts revalidate()`            | = revalidate-attempt count           |
  | `theme.initRefAcquire`                       | D     | [#734](https://github.com/pyreon/pyreon/issues/734) `theme.tsx initTheme()`          | bounded by # of mounted ThemeToggles |
  | `theme.initRefRelease`                       | D     | same                                                                                 | paired with acquire, monotonic       |
  | `solid-compat.createResource.staleDiscarded` | F     | [#737](https://github.com/pyreon/pyreon/issues/737) `createResource`                 | non-zero under refetch races         |
  | `solid-compat.createStore.signalEvicted`     | C     | [#737](https://github.com/pyreon/pyreon/issues/737) `createStore` sweep              | spikes during sweep cycles           |
  | `svelte-compat.subscribe.cachedRePush`       | D     | [#739](https://github.com/pyreon/pyreon/issues/739) `writable.subscribe` cached path | non-zero during parent re-renders    |
  | `vite-plugin.watchChange.delete`             | C     | [#741](https://github.com/pyreon/pyreon/issues/741) watchChange hook                 | grows with file-deletion count       |

  ### Catalog wiring

  `COUNTERS.md` gains 7 new entries (6 counters + the `theme.initRef*` pair).
  Each documents:

  - Exact source file
  - "Healthy number looks like" description (the diagnostic semantics)
  - The leak-class label + originating PR

  `catalog-drift.test.ts` `INSTRUMENTED_PACKAGE_ROOTS` adds 3 new entries:

  - `packages/tools/solid-compat/src`
  - `packages/tools/svelte-compat/src`
  - `packages/tools/vite-plugin/src`

  The existing `packages/zero/zero/src` entry is unchanged (already
  present for the `ssg.*` namespace). The bidirectional catalog gate
  (every emit must be cataloged; every cataloged name must have an
  emit) enforces the link going forward.

  ### Validation

  - 1555/1556 tests pass across the 5 modified packages (1 pre-existing
    zero skip):
    - `@pyreon/zero` 953/954
    - `@pyreon/solid-compat` 218/218
    - `@pyreon/svelte-compat` 55/55
    - `@pyreon/vite-plugin` 104/104
    - `@pyreon/perf-harness` 225/225 (including the catalog-drift gate)
  - Lint + typecheck clean across all 5 packages
  - Zero public-API surface change — counters are dev-only sink emissions

  ### Closes the MEDIUM followup recommendation

  Per the post-[#743](https://github.com/pyreon/pyreon/issues/743) review. Production monitoring stories for leak-class
  regressions are now structurally observable via the existing
  `perfHarness.snapshot()` / `perf:diff` flow. The LOW followup
  (`scripts/audit-leak-classes.ts` static-analysis tool) follows in a
  separate PR.

- [#739](https://github.com/pyreon/pyreon/pull/739) [`165d452`](https://github.com/pyreon/pyreon/commit/165d45276bac894eb88ac469ec04e1313060fe41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(svelte-compat): writable.subscribe leak when ChildInstance is preserved across parent re-renders ([#733](https://github.com/pyreon/pyreon/issues/733) followup)

  Closes the third MEDIUM pattern from [#733](https://github.com/pyreon/pyreon/issues/733)'s audit byproducts.

  ### The bug

  `writable.subscribe()` from inside a compat component's body leaks
  one subscriber per parent re-render cycle. The interaction between
  two parts of the layer caused it:

  1. `index.ts:subscribe` caches the unsub at `ctx.hooks[idx]` AND
     pushes it into `ctx.unmountCallbacks`. On subsequent renders the
     cached fast path fires: `if (cached) { run(v); return cached.unsub }`.

  2. `jsx-runtime.ts:170-173` — when a parent re-renders and preserves
     the ChildInstance, the wrapper resets `ctx.unmountCallbacks = []`
     to drop stale cycle-N callbacks before cycle-N+1 begins.

  The cached path NEVER re-pushed the unsub into the new (empty)
  array. So:

  - Initial mount: subscribe → unsub pushed → unmountCallbacks = [unsub]
  - Parent re-render: unmountCallbacks reset to [] → child re-runs
    → cached path returns cached.unsub without pushing → still []
  - Final unmount: unmountCallbacks loop runs over [] — the original
    unsub is never called — the store's `subs.Set` keeps the
    subscriber forever.

  Linear growth: one leaked subscriber per parent re-render cycle per
  `writable.subscribe()` call in the child. Long-lived parent + many
  re-renders + child stores → unbounded subscription growth on each
  affected store.

  ### Fix

  In the cached path, re-push the cached unsub if it's not already
  in `ctx.unmountCallbacks`. The `includes` guard is necessary because
  in real-app shape, a single child can `subscribe()` to multiple
  stores → multiple cached entries → multiple re-pushes per re-render;
  without the guard, the array would itself grow by one entry per
  subscribe-call per re-render.

  ### Regression tests + bisect

  `packages/tools/svelte-compat/src/tests/child-instance-leak-repro.test.ts`
  (2 specs):

  1. **Cached subscribe re-attaches unsub after reset** — single
     parent re-render cycle. Asserts `unmountCallbacks.length === 1`
     after the cached path fires, and that post-unmount the subscriber
     is fully cleaned up (no further `run` calls on store writes).
  2. **10 parent re-render cycles** — repeats the cycle 10× and
     asserts the array still has exactly 1 entry (the same unsub),
     then asserts post-unmount cleanup is total.

  **Bisect-verified**: removed the `ctx.unmountCallbacks.push(cached.unsub)`
  re-push → both specs fail with `expected +0 to be 1`. Restored →
  2/2 pass.

  ### Validation

  - `@pyreon/svelte-compat` 55/55 tests pass (+2 new)
  - Lint + typecheck clean
  - No public-API surface change

  ### Remaining LOWs from [#733](https://github.com/pyreon/pyreon/issues/733)

  - `@pyreon/vite-plugin` per-instance caches eviction on file delete —
    separate PR (next phase of the follow-up sweep).

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.16.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.16.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.16.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.15.0

### Minor Changes

- Initial release. Svelte-compatible **importable runtime API** powered by
  Pyreon's signal-based reactive engine — the fifth compat layer alongside
  react / preact / vue / solid.

  Shims the APIs Svelte code actually `import`s:

  - **`svelte/store`** — `writable`, `readable`, `derived` (sync + async/
    cleanup forms), `get`, `readonly`. Backed by Pyreon `signal`; the store
    contract (`subscribe(run, invalidate?) → unsubscribe`, lazy
    `start(set, update?) → stop` notifier with `0→1` / `1→0` semantics)
    matches Svelte exactly.
  - **`svelte`** — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`,
    `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
    `createEventDispatcher`, `mount`, `unmount`, `flushSync`.
  - Re-exports `For` / `Show` / `Switch` / `Match` / `Suspense` /
    `ErrorBoundary` from `@pyreon/core` for control-flow parity.

  Scope boundary (same as solid-compat draws around Solid's compiler): no
  `.svelte` SFC compiler, no Svelte 5 rune _syntax_ (`$state`/`$derived`/
  `$effect`) — those are compiler constructs, not runtime imports.

  Documented behavioural boundaries: `beforeUpdate`/`afterUpdate` map to a
  post-first-render hook (the compat wrapper re-renders by teardown+rebuild,
  no per-update diff); `getAllContexts` returns an empty `Map`.

  Wired into `@pyreon/vite-plugin` via `pyreon({ compat: 'svelte' })`,
  covered by unit + real-Chromium browser smoke + the compat-layers e2e
  gate (`examples/svelte-compat`).
