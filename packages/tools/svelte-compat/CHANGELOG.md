# @pyreon/svelte-compat

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
