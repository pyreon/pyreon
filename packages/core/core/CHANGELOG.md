# @pyreon/core

## 0.24.2

### Patch Changes

- [#806](https://github.com/pyreon/pyreon/pull/806) [`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `captureCallSite` (the "Called from:" hint emitted with `onMount() / onUnmount() / onUpdate() called outside component setup` warnings) now skips published-bundle paths AND function-name matches, not just source-tree paths.

  **The bug**: pre-fix the skip patterns only matched workspace source paths (`/lifecycle\.ts/`, `/\/core\/src\//`, etc.). Published packages bundle to `node_modules/@pyreon/<name>/lib/index.js`, so for npm consumers (i.e. almost everyone in production dev) the framework's own stack frames slipped through the filter. The walker returned the first non-`<anonymous>` `at` line — which was `captureCallSite` itself or `warnOutsideSetup` — making every warning's "Called from:" line point at the warning emitter instead of the actual user/framework call site.

  Net result: the diagnostic that was supposed to make these warnings actionable was broken across every published consumer.

  **The fix**:

  - Skip `/\/lifecycle\.[tj]s/` (covers `.ts` source AND `.js` bundles)
  - Skip `/\bcaptureCallSite\b/` and `/\bwarnOutsideSetup\b/` (function-name match — survives bundling)
  - Skip `/\/(core|reactivity|runtime-dom|runtime-server|router|head|ui-core|styler|unistyle|rocketstyle|attrs|elements|kinetic)\/src\//` for every framework package that internally calls lifecycle hooks
  - Skip `/node_modules\/@pyreon\/[^/]+\/lib\//` AND `/@pyreon\/[a-z-]+\/lib\//` — the published-bundle blanket

  The first source `.ts` only patterns are kept for safety; the new matchers stack on top so workspace and published consumers BOTH get the right call-site hint now. User-installed third-party packages outside `@pyreon/*` are NOT silenced — only framework code is filtered.

  Bisect-verified: reverting the patterns to the pre-fix shape (src-only, no function-name match) fails 3 of the 8 new regression tests in `lifecycle.test.ts` (`skips published-bundle lib paths`, `skips workspace source paths`, `skips the warning infrastructure itself`). Restored → 531/531 `@pyreon/core` tests pass + no `TEMP BISECT` remnants.

  Long-standing bug — the source-path-only filter has been in `lifecycle.ts` since at least 0.20.0. It just hadn't been a complaint because no high-frequency warning path was hitting it before the dev 404 fix in 0.24.1 ([#792](https://github.com/pyreon/pyreon/issues/792)) exposed every Vite dev iteration to provider re-renders.

- Updated dependencies []:
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- [#768](https://github.com/pyreon/pyreon/pull/768) [`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `captureContextStack()` now deduplicates: only the topmost frame per context-id is retained in the captured snapshot. Closes the residual snapshot-amplification leak that the `restoreContextStack` reference-identity fix (0.23.0) didn't reach.

  ## Background

  Heap snapshots from 0.21.x showed 1.22 MB / 321k-entry arrays retained by effect closures under deeply-nested reactive boundaries — the live context stack accumulating frames across reactive remounts. The 0.23.0 `restoreContextStack` fix (changing position-based truncation to reference-identity splice) cleaned the LIVE stack, dropping the headline metrics 7-16×.

  But the residual remained — heap snapshots still showed **20 arrays at 157 KB each (~40k entries)** retained by effect closures. Root cause: `captureContextStack()` was `[...getStack()]` — a verbatim copy of the live stack at the moment of capture. When that capture landed inside a nested `restoreContextStack` window (the live stack temporarily holds the same context-id pushed by multiple nested effects), the snapshot baked those duplicates in. Each effect's closure then retained them for its lifetime.

  ## The fix

  `captureContextStack()` now walks the stack top-to-bottom keeping only the topmost frame for each context-id. **Semantically equivalent to the verbatim copy** because `useContext()` walks the stack in reverse and stops at the first matching frame — any shadowed frame is unreachable by definition.

  ```ts
  // Before
  return [...getStack()]; // 40k entries under deep nesting

  // After
  // Walk top-to-bottom, keep topmost-per-id frames
  const seen = new Set<symbol>();
  const reversed: Map<symbol, unknown>[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    let unique = false;
    for (const id of frame.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        unique = true;
      }
    }
    if (unique) reversed.push(frame);
  }
  reversed.reverse();
  return reversed;
  // → ~N entries where N = distinct context ids in scope (typically 2-10)
  ```

  ## Safety: why this preserves all existing behavior

  The naïve "just dedup the array" version would have silently broken SSR. `@pyreon/runtime-server` was using `captureContextStack().length` as a stack-position marker for cleanup (4 call sites) — relying on `snapshot.length === live stack length`. Dedup makes the snapshot shorter, which would have caused SSR cleanup to pop fewer frames than it pushed.

  **Pre-requisite fix (also in this PR)**: introduce `getContextStackLength()` — a non-allocating helper that reads the LIVE stack length directly. Migrate the 4 SSR call sites to use it instead of `captureContextStack().length`. After this migration, dedup at capture time has zero observable effect on SSR length bookkeeping.

  `restoreContextStack` already removes snapshot frames by **reference identity** (not by position or count) — the cleanup logic works identically against a deduped snapshot.

  `@pyreon/runtime-dom`'s `mountReactive` uses the snapshot for restoration only, not for length. Safe to dedup.

  The reactivity layer's `setSnapshotCapture` DI hook (used by `_bind`, `renderEffect`, `effect`) passes the snapshot back unchanged into `restore` — no length dependency. Safe to dedup.

  ## Tests

  18 new specs in `context.test.ts`:

  - **Dedup behavior** (8 specs): empty stack → empty snapshot; single frame → identical; no duplicates → verbatim; duplicate ids collapse to topmost; deep duplicate-heavy stack collapses correctly; multi-key frames kept if any id is un-shadowed; multi-key frames dropped if all ids are shadowed; useContext returns same value pre/post dedup for arbitrary read patterns.
  - **restoreContextStack with deduped snapshots** (2 specs): restoration semantically equivalent; 40-duplicate stack only pushes/pops 1 frame post-dedup.
  - **getContextStackLength** (3 specs): returns LIVE stack length not snapshot length; zero on empty stack; matches array length through push/pop cycles.
  - **Leak audit regression locks** (2 specs):
    - 1000 snapshots of a 100-frame duplicate-heavy stack retain **1000 total frame references**, not 100,000.
    - 100 snapshots of a 500-frame mixed stack with 50 distinct ids retain **5000 frame references**, not 50,000.

  ## Bisect-verified

  - Revert `captureContextStack` to `[...getStack()]` → **6 dedup-behavior specs + 2 leak-audit specs fail**; 29 pre-existing specs still pass (semantic equivalence preserved).
  - Restored → 37/37 context tests, 523/523 `@pyreon/core`, 150/150 `@pyreon/runtime-server`, 681/681 `@pyreon/runtime-dom`, 521/521 `@pyreon/router` — total **1875 tests across affected packages**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

  ## Impact

  - **Per-snapshot retention drops from O(stack-depth) to O(distinct-ids-in-scope)** — typically 100× reduction on deep trees, the same shape as the bug-report's 800× extrapolation.
  - The leak-audit unit tests are permanent regression locks — re-introducing the bug shape fails CI deterministically (no heap snapshot needed).

  ## Honest scope note

  This PR closes the per-snapshot allocation amplification. The orthogonal "snapshots themselves accumulate in proportion to effect count" concern (raised in the analysis) is NOT addressed here — that's an inherent property of the effect-per-component architecture, not a leak. A possible future Map-interning pass could deduplicate identical snapshot ARRAYS via WeakMap, sharing one allocation across multiple effects whose contexts match. Filed as separate work if numbers warrant.

- Updated dependencies [[`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#725](https://github.com/pyreon/pyreon/pull/725) [`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(core): context stack leak under repeated reactive remounts — provide() + restoreContextStack now use identity-based frame removal

  **Reported symptom**: `@pyreon/core@<=0.22.0` apps that repeatedly remount subtrees containing `provide()` calls (route navigation, theme toggle, `<Show>` / `<For>` cycling, kinetic transitions) accumulate orphan frames on the module-level context stack. One reporter observed a 1 GB heap where 33 in-flight effect snapshots × ~10,000-frame copies each retained ~138 MB of arrays. The live context stack held 321,024 entries but only 47 distinct provider Map instances — the same providers were re-referenced thousands of times each.

  **Root cause** (two cooperating bugs):

  1. `provide()` registered `onUnmount(() => popContext())`. `popContext` pops `stack.pop()` — the last frame. That assumes strict LIFO between push and pop, but `mountReactive`'s effect-re-fire flow runs the previous-mount subtree cleanup INSIDE the effect's snapshot-restore window. The snapshot-pushed frames sit ABOVE the descendant's own provider frame at the moment its `onUnmount` fires. `popContext` pops the snapshot push; the descendant's provider frame is orphaned on the live stack.
  2. `restoreContextStack` used position-based `stack.splice(insertIndex, snapshot.length)` to remove its pushes on exit. That assumed the pushes stayed where they were placed — but identity-based removal by a descendant (fix 1) can shift them down, making `splice(insertIndex, …)` either a no-op or pull the wrong frames.

  **Fix**: both layers now use IDENTITY-based removal.

  - `provide()` and `withContext()` capture the frame reference at push, register `onUnmount(() => removeContextFrame(frame))`, where `removeContextFrame` does `stack.splice(stack.lastIndexOf(frame), 1)`. Robust to "wrong frame on top" because it splices the specific frame regardless of position. `lastIndexOf` matches the most-recent occurrence — preserves LIFO ordering when the same `Map` reference appears multiple times (the snapshot-push case).
  - `restoreContextStack`'s finally now iterates `snapshot` in reverse and removes each frame via `stack.lastIndexOf(frame) + splice`. Same identity-based approach. Robust to descendants having removed frames at earlier indices.

  `popContext` is preserved as the public position-based API — only `provide` / `withContext` switch to the safe path. Server-side `trimContextStack` in `@pyreon/runtime-server` still uses `popContext` correctly because SSR has no reactive boundaries pushing snapshot frames during render.

  **Regression tests** (`packages/core/runtime-dom/src/tests/ctx-stack-growth-repro.test.tsx`, 4 specs): the nested-boundaries-with-providers shape that reproduces the leak (502 orphan frames after 500 toggle cycles pre-fix) is the load-bearing one. Bisect-verified: reverting `context.ts` to pre-fix state → that spec fails with `expected 502 to be less than 10`. The other 3 specs (single-boundary, signal-driven re-mount, descendant useContext correctness) pass even pre-fix — they're guards against the FIX regressing the useful behavior.

  No public-API surface change. `provide` / `useContext` / `popContext` / `pushContext` / `withContext` / `captureContextStack` / `restoreContextStack` keep their existing signatures. Behavior change is invisible to correct existing code; the leak shape was undetected because `useContext` walks the stack top-down and finds the freshest provider regardless of whether orphan frames exist below.

- [#729](https://github.com/pyreon/pyreon/pull/729) [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(core): ErrorBoundary stack cleanup now removes the right handler when siblings unmount out-of-order ([#725](https://github.com/pyreon/pyreon/issues/725) sibling fix)

  `ErrorBoundary` pushed its error handler onto a module-level `_errorBoundaryStack` at setup and registered `onUnmount(() => popErrorBoundary())`. `popErrorBoundary()` was `stack.pop()` — position-based. That assumed strict LIFO between push and pop, **but sibling boundaries can unmount in any order driven by the renderer**: keyed `<For>` removing a non-last item, `<Show>` flipping the first of several siblings, route nav unmounting an outer of nested routes, etc.

  **Symptom**: when a non-last sibling boundary unmounted, its `onUnmount` popped the LAST boundary's handler instead of its own. The surviving (innermost) boundary's handler was removed from the stack; the unmounted boundary's stale handler was orphaned at the top. A subsequent throw in the surviving boundary's children dispatched to the orphan handler — `error.set(err)` on a disposed signal is a no-op, so the error was **silently swallowed** AND the surviving boundary's fallback never rendered. Same root-cause class as [#725](https://github.com/pyreon/pyreon/issues/725) (`provide()` / `popContext()`).

  **Fix**: `popErrorBoundary(handler)` accepts the handler reference and removes by IDENTITY via `lastIndexOf + splice` — robust to "wrong handler on top" regardless of unmount order. `ErrorBoundary`'s `onUnmount` now passes its own handler. Back-compat: `popErrorBoundary()` (no-arg) still does `stack.pop()` for direct callers (tests, advanced consumers).

  Regression tests in `packages/core/runtime-dom/src/tests/error-boundary-stack-leak-repro.test.tsx` — bisect-verified: reverting `component.ts` + `error-boundary.ts` → the FIRST-unmounted-sibling spec fails with `AssertionError: expected null to be truthy` (the surviving boundary's fallback never appears because the throw is routed to the orphan). Restored → 2/2 pass. All 2,458 tests across the 7 core packages pass with the fix.

  Discovered while sweeping core packages for [#725](https://github.com/pyreon/pyreon/issues/725)-class bugs (position-based cleanup of shared module-level state). The audit also surfaced 3 lower-risk patterns (router refcount idempotency, router preload bypassing LRU cache contract, unused `_scrollPositions` field) — all fileable as separate follow-ups.

- [#733](https://github.com/pyreon/pyreon/pull/733) [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(tools): post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729)/[#730](https://github.com/pyreon/pyreon/issues/730) leak-class sweep — vue-compat provide/createApp context-stack leaks + lint AstCache unbounded growth

  Audit pass across all 12 `packages/tools/*` packages for the same patterns behind [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on shared module-level stack under non-LIFO unmount), [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation), and [#730](https://github.com/pyreon/pyreon/issues/730) (refcount under-count + inflight-cache rejection). Found 3 HIGH suspects + 4 MEDIUM patterns. This PR fixes the three HIGH suspects.

  ### 1. `@pyreon/core` — export `removeContextFrame`

  The internal identity-based stack-frame remover already existed in `packages/core/core/src/context.ts` (used by `provide()` post-[#725](https://github.com/pyreon/pyreon/issues/725)) but wasn't exported. Compat layers and advanced consumers that call `pushContext` directly need this primitive to do safe identity-based cleanup. Now exported alongside `popContext` / `pushContext` from the package root. No behavior change for existing code — purely an additive export.

  ### 2. `@pyreon/vue-compat` `provide(key, value)` — context-stack frame leak (exact [#725](https://github.com/pyreon/pyreon/issues/725) shape)

  Vue's `provide(key, value)` semantics use string/symbol keys with a key→Context registry. The vue-compat implementation pushed a Map onto Pyreon's global context stack and registered `unmountCallbacks.push(() => popContext())` — the _position-based_ `stack.pop()` that [#725](https://github.com/pyreon/pyreon/issues/725) explicitly flagged as unsafe.

  `@pyreon/core/context.ts` documents: _"The `provide()` helper does NOT use this — it uses identity-based removal via `removeContextFrame` because reactive boundaries can push snapshot frames between a component's `provide(ctx, value)` and its eventual unmount, making the top-of-stack unsafe to assume."_ vue-compat bypassed that safety.

  Real-app symptom: two sibling components both call `provide('K', …)`. They unmount in renderer-driven order (keyed `<For>` removing a non-last item, `<Show>` flipping a non-last sibling, route nav unmounting an outer of nested provider chains). The first-unmounted's `popContext` removed the LAST sibling's frame instead of its own; the surviving sibling's frame was orphaned at the top of the global stack forever.

  Fix: capture the frame at push, register `unmountCallbacks.push(() => removeContextFrame(frame))`. Mirror of the framework's own `provide()` fix from [#725](https://github.com/pyreon/pyreon/issues/725).

  ### 3. `@pyreon/vue-compat` `createApp(C).provide(k, v).mount(el)` — app-level provisions pushed but never popped

  `createApp.mount()` ran `pushContext(new Map([[ctx.id, value]]))` for each app-level provision but the returned unmount function only ran `pyreonMount`'s cleanup — leaving the app-level frames on the global stack forever, one per provision per mount cycle.

  Real-app symptom: test harness or app entry calls `createApp(C).provide('A', a).provide('B', b).mount(el)` then unmounts. Two app-level frames stay on the context stack forever. SSG / re-mount cycles compound this.

  Fix: track every pushed frame in a local array during `mount()`, remove each by identity (reverse order) in the returned unmount closure.

  ### 4. `@pyreon/lint` `AstCache` — unbounded growth in LSP / `--watch` sessions

  `AstCache` (used by `lint` programmatic API, the LSP server, and `pyreon-lint --watch`) keyed by FNV-1a hash of source text with `cache: Map<string, …>` and NO eviction strategy. Each entry holds a multi-MB oxc-parsed AST + `LineIndex`. A long-running LSP session editing across many files accumulates one entry per UNIQUE content snapshot ever seen — after hours of editing, hundreds of MB of heap.

  Fix: LRU bound (default 256 entries). `Map` preserves insertion order, so the first key is the least-recently-used. `get` / `set` on an existing key refresh recency by re-inserting at the tail. Apps that lint thousands of distinct files in tight succession can bump the cap via `new AstCache(2048)`.

  ### Regression tests + bisect

  - `packages/tools/vue-compat/src/tests/provide-stack-leak-repro.test.ts` (2 specs) — `createApp().provide().mount(el); unmount()` returns the global context stack to baseline; 100 mount/unmount cycles do NOT accumulate frames. **Bisect-verified**: revert `vue-compat/src/index.ts` → both specs fail with stack-length assertions; restored → pass.
  - `packages/tools/lint/src/tests/ast-cache-lru.test.ts` (5 specs) — cache never exceeds `maxEntries`, evicts LRU on overflow, `get`/`set` refresh recency, re-setting an existing key doesn't double-count, default cap is 256. **Bisect-verified**: revert `lint/src/cache.ts` → all 5 fail; restored → pass.

  ### Validation

  - `@pyreon/core` 510/510 tests pass
  - `@pyreon/vue-compat` 218/218 tests pass (+ 2 new regression specs)
  - `@pyreon/lint` 639/639 tests pass (+ 5 new LRU specs)
  - Lint + typecheck clean across all 3 packages
  - Zero public-API breakage (`removeContextFrame` is a purely additive export)

  ### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

  The 12-package audit also surfaced 4 MEDIUM-risk patterns documented in the audit report. Each filed-worthy as a separate small follow-up:

  1. **`@pyreon/solid-compat` `createStore` per-path signal map grows unbounded** — one signal per UNIQUE read-path string. Problematic for stores with dynamic key spaces (dictionaries, pagination, logs).
  2. **`@pyreon/solid-compat` `createResource` has the Class-F stale-resolution race** — `fetchPromise` overwritten on refetch with no AbortSignal; old promise's success handler still runs `setData`. Same shape as [#730](https://github.com/pyreon/pyreon/issues/730)-charts/storage inflight-promise bug.
  3. **`@pyreon/svelte-compat` ChildInstance preservation discards `unmountCallbacks` without firing them** — the cached `writable.subscribe` short-circuit doesn't re-register the unsub after the reset. Subtle; needs a targeted reproducer.
  4. **`@pyreon/vite-plugin` per-instance caches (`signalExportRegistry`, `resolveCache`, `pyreonWorkspaceDirCache`, `islandRegistry`) never evict** stale entries when source files are deleted/renamed during a long `vite dev` session. Bounded by source tree size in practice, but no invalidation on file delete.

  Plus 6 LOW-risk patterns (devtools `expandedIds` accumulating across panel session, lint LSP debounceTimers not cleared on didClose, svelte-compat globalThis CTX_REGISTRY, vite-plugin HMR registry never deletes, vue-compat `_contextRegistry` global map, etc.) — none real leaks in practice, all bounded by user surface.

  ### `pyreon doctor` baseline

  Saved at `/tmp/doctor-tools-baseline.json`. 94 findings across `packages/tools/*`: 51 errors + 24 warnings + 19 infos. Top patterns: `lint/pyreon/no-window-in-ssr` (51, mostly devtools Chrome-extension false positives), `lint/pyreon/no-children-access` (10), `lint/pyreon/no-error-without-prefix` (10), `lint/pyreon/no-raw-addeventlistener` (9), `lint/pyreon/no-dom-in-setup` (7). Separate hardening pass; this PR addresses the structural bugs not caught by static lint rules.

- Updated dependencies []:
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0

## 0.19.0

### Minor Changes

- [#598](https://github.com/pyreon/pyreon/pull/598) [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Error reports now carry the reactive run-up to the crash.

  For a signal framework, the first question a crash raises isn't _what threw_ — the stack answers that — it's _what reactive state led there_. Pyreon's `ErrorContext` previously carried component / phase / props / error but nothing about the signal activity that produced the bad state.

  **New: `ErrorContext.reactiveTrace`** — the last ~50 signal writes (chronological, oldest → newest) leading up to the error. The causal _sequence_, not a point-in-time snapshot (a snapshot of every value can't explain _how_ the app reached the bad state; the order of writes can). Populated automatically — every registered error handler (Sentry/Datadog/console) gets it for free:

  ```ts
  registerErrorHandler((ctx) => {
    Sentry.captureException(ctx.error, {
      extra: { component: ctx.component, reactiveTrace: ctx.reactiveTrace },
      // e.g. [{ name: 'status', prev: '"idle"', next: '"submitting"' },
      //       { name: 'user',   prev: 'null',    next: 'User {id, …}' }]
    });
  });
  ```

  **New: `getReactiveTrace()` / `clearReactiveTrace()`** (`@pyreon/reactivity`) — read / reset the buffer directly (devtools, test isolation), plus the `ReactiveTraceEntry` type.

  Design properties:

  - **Zero production cost.** The recorder feeding the buffer sits behind the bundler-agnostic production dead-code gate in `signal.ts` `_set` and tree-shakes out of prod bundles. `reactiveTrace` is simply `undefined` in production. Verified: bundle budgets unchanged (all 54 within budget), perf-harness tree-shake regression passes.
  - **Bounded + leak-safe.** Fixed-size (~50-entry) ring buffer, oldest-evicted, never grows. Stores **truncated string previews** of values — never raw references — so it can't pin large arrays / detached DOM / closures, and is always safe to serialize into a report. Hostile values (throwing getters, cycles, huge strings, BigInt) are handled without throwing.
  - **Distinct from `onSignalUpdate`.** That is opt-in and captures stacks (expensive, for time-travel debugging). This is always-on in dev, deliberately cheap (no stack), and exists specifically to enrich error reports.
  - **Best-effort.** Trace capture in `reportError` is wrapped so a buggy/empty trace can never block the real error from reaching handlers. Caller-supplied `reactiveTrace` is never overwritten.

  Bisect-verified at both layers: (1) removed the `_recordSignalWrite` call → reactivity ring-buffer tests fail; (2) removed the `reportError` enrichment → `telemetry.test.ts > attaches recent signal writes` fails at `expect(captured?.reactiveTrace).toBeDefined()`; restored → all pass. Suites: `@pyreon/reactivity` 290, `@pyreon/core` 497.

### Patch Changes

- [#590](https://github.com/pyreon/pyreon/pull/590) [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` inline form now typechecks at source level. Closes the verify-modes gap left by PR [#587](https://github.com/pyreon/pyreon/issues/587).

  ## Two changes

  **1. Widened prop types so inline form typechecks.** Before this PR, `<Defer when={x}><Modal /></Defer>` would fail TypeScript with `Type 'VNode' is not assignable to type '(Component: ComponentFn<P>) => VNodeChild'`. The `children` prop was typed only as the render-prop form, but the compiler-driven inline form passes raw JSX. TS checks the source BEFORE the compiler pass runs, so both shapes need to typecheck:

  - `children?: ((Component) => VNodeChild) | VNodeChild` (was: render-prop only)
  - `chunk?: () => Promise<...>` (was: required) — inline form has no `chunk` at source level; compiler synthesizes it

  **2. Dev-mode error when chunk is missing at runtime.** Since `chunk` is now optional at type level, the runtime guards against the case where the inline form reaches runtime without the compiler pass having run (e.g. user runs tests through a bundler that doesn't include `@pyreon/vite-plugin`). Throws a clear actionable error pointing at both shapes.

  ## Also adds the verify-modes assertion that should have shipped with PR [#587](https://github.com/pyreon/pyreon/issues/587)

  Adds an inline-Defer regression gate to the `playground × spa` verify-modes cell:

  - New fixture component `examples/playground/src/components/DeferredFixture.tsx` with a unique fingerprint string
  - `examples/playground/src/pages/About.tsx` uses `<Defer when={open}><DeferredFixture /></Defer>`
  - New `assertStringInExactlyOneChunk(dist, fingerprint, expectedPrefix)` helper in `scripts/verify-modes.ts`
  - Cell asserts:
    - The fingerprint appears in EXACTLY ONE chunk
    - That chunk's basename starts with `DeferredFixture-` (proving Rolldown grouped it by the deferred component's own name, not under a shared route chunk)

  **Bisect-verified**: with the `transformDeferInline` call disabled in the vite-plugin's `transform()` hook, the fingerprint lands in `about-*.js` (the route chunk pulls in DeferredFixture via the un-removed static import) and the cell fails with `expected basename to start with "DeferredFixture-". Got: about-*.js`.

  ## Honest disclosure of gaps still NOT addressed

  - **Props on inline child** — `<Defer when={x}><Modal title="hi" /></Defer>` still bails to explicit form
  - **Closure capture** — `<Modal count={count} />` where count is a local signal still bails
  - **Renamed imports** — `{ Modal as M }` still bails
  - **Namespace imports** — `import * as M from './X'` still bails

  These remain known constraints for v1; future PRs can relax each one.

- [#630](https://github.com/pyreon/pyreon/pull/630) [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: make `pyreon doctor` objective + close the real first-party findings it then surfaced

  `pyreon doctor` reported a meaningless **F (score 55, 987 errors)** because
  its `lint` / `react-patterns` / `pyreon-patterns` gates scanned the WHOLE
  repo: example apps (intentionally framework-idiomatic, incl. react-compat
  demos), `e2e/`/`docs/`/`scripts/`, detector test-fixtures (which
  _deliberately_ contain anti-patterns so the detectors can be tested), and
  the `*-compat` packages (whose public API IS React/Vue/etc. by design).
  ~705/987 errors were examples + fixtures; the rest a never-CI-enforced
  advisory backlog or by-design.

  **Objectivity (the deliverable):** the three gates now audit ONLY
  first-party published source — `packages/<cat>/<pkg>/src/**`, excluding
  tests/fixtures/`.d.ts` — via pure, unit-tested predicates
  (`isFirstPartySourceFile` / `isCompatPackageFile`); `react-patterns`
  additionally skips `*-compat` src (a React-API shim containing `useState`
  is a definitional false positive). Errors **987 → 86**.

  **Detector precision (false positives are the antithesis of objective):**

  - `@pyreon/compiler` `dot-value-signal`: now requires the receiver to be a
    tracked signal binding — no longer flags `input.value` / `cell.value` /
    `o.value` (17 FPs; bisect-verified).
  - `@pyreon/lint` `no-window-in-ssr`: recognizes field-captured typeof
    (`this.isSSR = typeof document === 'undefined'`) and function-head
    early-return guards covering nested closures (bisect-verified).
  - `@pyreon/lint` `no-bare-signal-in-jsx`: now supports `exemptPaths`
    (consistent with the other exemptable rules) — render-function
    primitives read signals in JSX _attribute_ positions which the compiler
    `_rp()`-wraps; the text-position heuristic over-fired there.

  **Genuine first-party SSR bugs fixed** (the rule correctly did NOT silence
  these — cross-function/method guards aren't lexically traceable):

  - `@pyreon/head` `createNewTag` — added `typeof document` guard.
  - `@pyreon/styler` `Sheet.mount()` — in-method `if (this.isSSR) return`.
  - `@pyreon/hotkeys` `detachListener` — `typeof window` guard.
  - `@pyreon/flow` flow-component — guarded `new ResizeObserver` with
    `typeof ResizeObserver === 'function'`.
  - `@pyreon/core` lifecycle — renamed a local `location` shadowing the
    browser global (hygiene; also removed an SSR-analysis false positive).

  **Curated `.pyreonlintrc.json`** exemptions (with rationale) for
  genuinely-non-SSR-runtime surfaces: `@pyreon/compiler` (build-time Node)
  and `*-compat` (DOM-runtime framework adapters, consistent with the
  existing `runtime-dom` exemption) for `no-window-in-ssr`; `*-compat` for
  `dev-guard-warnings` (intentional user-facing "[Pyreon] X not supported"
  guidance that must reach prod).

  **Result: errors 987 → 1.** The single remaining `no-window-in-ssr` in
  `@pyreon/ui-core` (`_isBrowser && matchMedia(...)`) is provably SSR-safe
  (short-circuit; `_isBrowser` is a `typeof`-AND const) — a documented
  known rule-precision limitation, left visible (NOT exempted: silencing it
  would hide future _real_ ui-core SSR bugs — anti-objective).

  Verified: 8 touched packages, 3091 unit tests pass; typecheck clean;
  full-repo `oxlint` 0 errors; e2e 127 specs pass (default 92 +
  ui-regression 26 + app-showcase 9); each detector change bisect-verified.

- [#642](https://github.com/pyreon/pyreon/pull/642) [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Repo sweep (round 2): a real memory leak + cross-compat duplication removal.

  **`@pyreon/styler` — unbounded `insertCache` + DOM `cssRules` growth (memory leak).** `evictIfNeeded()` trimmed ONLY the `cache` Map. The cssText-keyed `insertCache` (large keys — full CSS text) and the live `<style>` tag's `CSSStyleSheet.cssRules` were never evicted, so `maxCacheSize` bounded the _smallest_ of the three storage layers while the two memory-heavy ones grew for the entire process lifetime. Any app generating many distinct CSS strings (signal-driven dynamic styles, per-instance computed themes) leaked Map entries + live DOM rules forever. Fix: a `className → Set<icKey>` reverse index plus a `className → CSSRule[]` object-ref index (object refs survive `deleteRule()` reindexing) let `evictKeys()` drop all three layers in lockstep — `cache.delete` + `insertCache.delete` + descending-index `deleteRule()`. `reset()` / `clearCache()` / `clearAll()` clear the two new indices too. `maxCacheSize` now genuinely bounds memory. No API/behaviour change for steady-state apps; dedup correctness preserved (re-inserting an evicted rule yields the same deterministic className + exactly one live DOM rule). Bisect-verified: reverted `evictKeys` to pre-fix cache-only behaviour → `insertCache stays bounded` failed `expected 300 to be ≤ 75`, `live DOM cssRules count` failed `expected 180 to be ≤ 47`; restored → 13/13.

  **`@pyreon/core` + `@pyreon/react-compat` + `@pyreon/preact-compat` — compat duplication removal (behaviour-preserving).** `shallowEqual` (memo / useState bailout) was copy-pasted byte-identically into `react-compat/index.ts` and `preact-compat/hooks.ts`; the React/Preact DOM-prop mapping (`className→class`, `htmlFor→for`, `onChange→onInput`, `autoFocus`, `defaultValue`/`defaultChecked`, authoring-only strip) was near-duplicated across both jsx-runtimes (only divergence: React also stripped `suppressContentEditableWarning` — a no-op for Preact, so unifying is behaviour-preserving). Consolidated into a new `@pyreon/core/compat-shared.ts` (`shallowEqualProps`, `mapCompatDomProps`) — core is already a dependency of every compat package and already hosts the sibling cross-compat module `compat-marker.ts` (`nativeCompat`/`isNativeCompat`). Both packages now import the canonical helpers (aliased to local names — zero call-site churn).

  Validation: lint 0 errors; typecheck clean (styler + core + react-compat + preact-compat); styler 413/413, core 497/497, react-compat 224/224, preact-compat 157/157; styler browser smoke 9/9; e2e `ui-regression` 26/26 (styler/rocketstyle real-app gate); e2e `compat-layers` 12/12 (react/preact/vue/solid real-app gate); new `compat-shared.test.ts` 13/13.

  **Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor. That's a correctness-sensitive perf refactor, not a mistake / edge case / leak / duplicate, so it's out of scope for a behaviour-preserving sweep. `@pyreon/styler` `internElementBundle` css-prop interning ([#626](https://github.com/pyreon/pyreon/issues/626)-documented) — a distinct optimization, not a leak; its own PR. No other new memory leak found this round (prior sweeps already fixed signal.\_d / computed.direct / useSortable / ISR).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261)]:
  - @pyreon/reactivity@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Minor Changes

- [#585](https://github.com/pyreon/pyreon/pull/585) [`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `<Defer>` primitive — lazy-load a chunk when a trigger fires. Replaces the `lazy()` + `<Suspense>` + observer boilerplate with one component.

  Three trigger modes:

  ```tsx
  import { Defer } from '@pyreon/core'

  // Signal-driven (modal pattern)
  <Defer chunk={() => import('./ConfirmModal')} when={open}>
    {Modal => <Modal onClose={() => setOpen(false)} />}
  </Defer>

  // Viewport-driven (below-fold content)
  <Defer chunk={() => import('./Comments')} on="visible" rootMargin="200px">
    {Comments => <Comments postId={id} />}
  </Defer>

  // Idle-driven (non-critical, prefetch when CPU is free)
  <Defer chunk={() => import('./Analytics')} on="idle">
    {Dashboard => <Dashboard />}
  </Defer>
  ```

  Why this exists: `<Show when={open()}><Modal /></Show>` ships the modal code in the main bundle unconditionally. `<Defer>` defers the import (Rolldown sees `import('./X')` as a literal and chunks it) and only fires the trigger when the condition is met.

  API details:

  - `chunk: () => Promise<{ default: ComponentFn<P> } | ComponentFn<P>>` — dynamic import. The literal `import('./X')` is what enables chunk splitting.
  - `when?: () => boolean` — signal accessor. Load when truthy. Repeated truthy emissions are no-ops (chunk loads exactly once per Defer instance).
  - `on?: 'visible' | 'idle'` — alternative triggers. Mutually exclusive with `when`.
  - `children?: (Component) => VNodeChild` — render-prop for prop forwarding. Optional; defaults to `<Component />` with no props.
  - `fallback?: VNodeChild` — shown while the chunk is loading. Defaults to `null`.
  - `rootMargin?: string` — IntersectionObserver `rootMargin` for `on="visible"` mode. Default `'200px'`.

  SSR-safe: browser APIs (`IntersectionObserver`, `requestIdleCallback`) are gated behind `onMount` so server rendering doesn't crash. `requestIdleCallback` falls back to `setTimeout(1)` when unavailable (Safari < 16.4, jsdom).

  Error handling: a rejected `chunk()` throws synchronously at the next render. Wrap `<Defer>` in `<ErrorBoundary>` (or let it propagate to a parent boundary) to recover.

  This is v1 — explicit `chunk` prop, runtime-only. A v2 compiler-driven inline shape is planned: `<Defer when={x}><Heavy /></Defer>` where the compiler extracts the subtree to a synthetic chunk, no `chunk` prop or file extraction needed.

### Patch Changes

- [#584](https://github.com/pyreon/pyreon/pull/584) [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve reactive props through component-JSX spread + framework prop pipelines.

  **Bug class.** Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })` and `mount.ts:makeReactiveProps` converts `_rp`-branded thunks into property GETTERS on the props object. Any prop-pipeline step that VALUE-COPIES `props[key]` (plain assignment, spread, or `Object.assign`) fires the getter at HOC setup time — outside any tracking scope — and stores the resolved value as a static data property. Every downstream JSX accessor reading `props.x` then sees the captured-once value, never re-subscribing to the underlying signal.

  **Two layers of fix:**

  1. **Compiler-level (closes the bug class for all consumers, including user code).** Both the JS compiler (`src/jsx.ts`) and the Rust native binary (`native/src/lib.rs`) now wrap component-JSX spread arguments with the new `_wrapSpread(...)` helper from `@pyreon/core`. `<Comp {...source}>` compiles to `jsx(Comp, { ..._wrapSpread(source) })` — `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks, so the JS-level spread carries function values (no getters fire), and `makeReactiveProps` converts them back to getters on the consumer side. Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source unchanged — zero overhead for the 99% of spread sources that don't carry reactive props. Lowercase-tag (DOM) spreads route through the template path's `_applyProps` (already reactive) and skip the wrap.

  2. **Framework-level (closes every observed leak site in shipped packages):**
     - `@pyreon/rocketstyle` — `removeUndefinedProps` + `mergeDescriptors` (new helper in `utils/attrs.ts`) replace 3 spread sites in `rocketstyleAttrsHoc.ts` and `rocketstyle.ts`'s `mergeProps`. `finalProps.ref` / `$rocketstyle` / `$rocketstate` writes use `Object.defineProperty` (handles getter-only descriptors).
     - `@pyreon/styler` — `buildProps` in `forward.ts` copies descriptors via `copyDescriptor` instead of value-reads.
     - `@pyreon/ui-core` — `omit` / `pick` in `utils.ts` copy descriptors.
     - `@pyreon/elements` — Wrapper's `buildStyledProps` builds props via descriptor-preserving copy and forwards `ref` / `as` / extras via `Object.defineProperty`.
     - `@pyreon/core` — `jsx-runtime.ts`'s `jsx()` has a slow path that preserves descriptors when `props` arrives with getters (for direct `h()` callers).
     - `@pyreon/runtime-dom` — `applyProps` in `props.ts` detects getter descriptors and wraps the write in `renderEffect`.

  **Bisect-verified at TWO layers:**

  - **Unit / browser**: `packages/ui-system/rocketstyle/src/__tests__/reactive-props-preservation.test.ts` (9 specs) + the new `rocketstyle.browser.test.tsx` spec covering the full pipeline. Reverting any of the 4 leak-site fixes individually fails the relevant spec with `expected 'count: 1' to be 'count: 0'`.
  - **Real-Chromium e2e**: `e2e/ui-showcase-regression.spec.ts:793 — signal-driven prop on Button updates the DOM on flip` exercises a rocketstyle Button with a `title={\`count: \${count()}\`}` prop fed by a signal. Reverting the compiler-level fix (`packages/core/compiler/src/jsx.ts`+`native/src/lib.rs`+ rebuilding the Rust binary) → spec fails with`unexpected value "count: 0"` after click — proving the spread reactivity contract holds end-to-end through the entire prop pipeline (rocketstyle attrs HOC → styler buildProps → Element Wrapper → runtime-dom applyProps).

  **No public API breakage.** `_wrapSpread` is an internal compiler-emitted helper; users never call it directly. Framework-internal helpers (`mergeDescriptors` in rocketstyle, `copyDescriptor` in styler, etc.) are not exported. The only public surface change is that getter-shaped reactive props now survive every framework boundary — i.e. the reactive-prop contract finally works as documented.

- Updated dependencies []:
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- Updated dependencies []:
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- [#258](https://github.com/pyreon/pyreon/pull/258) [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Performance rearchitecture: reactive theme/mode/dimension switching via computed (not effect).

  - **styler**: `DynamicStyled` uses one `computed()` per component (not `effect()`) to track theme + mode + dimension signals. The resolve itself runs `runUntracked()` to prevent exponential cascade. String-equality memoization eliminates redundant DOM updates. Per-definition WeakMap cache (Tier 2) skips resolve entirely for repeated identical inputs.
  - **styler**: `ThemeContext` is a `createReactiveContext<Theme>`. `useThemeAccessor()` returns the raw accessor for tracking inside computeds.
  - **ui-core**: `PyreonUI` nested `inversed` prop inherits parent mode reactively — inner section automatically flips when outer mode changes.
  - **unistyle**: `styles()` uses key→index lookup (Tier 1) — 257 descriptor iterations reduced to ~10-20 per call.
  - **rocketstyle**: passes `$rocketstyle`/`$rocketstate` as function accessors tracked by the styled computed.
  - **router**: `RouterLink` guards non-string `props.to` in activeClass (fixes SSR crash with `styled(RouterLink)`).
  - **core**: `popContext()` is a silent no-op on empty stack.

  Expected impact: 2+ GB memory → < 100 MB, 20s render → < 2s for 150-component pages.

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- ## Bug Fixes

  ### Responsive CSS pipeline — restore `css` template results in `processDescriptor` ([#208](https://github.com/pyreon/pyreon/issues/208))

  Follow-up to the 0.12.12 regression fix. `processDescriptor.ts` had the same plain-string bug as `styles/index.ts` — special descriptors (`fullScreen`, `backgroundImage`, `hideEmpty`, `clearFix`) were returning plain strings instead of `css` tagged-template results. This broke the CSS interpolation chain at a deeper level than the 0.12.12 fix addressed, causing media queries to not generate correctly for responsive props like `maxWidth: { xs: 640, md: 840 }`.

  Restored the `css` template wrapping throughout the responsive pipeline, matching the reference implementation.

  ### `onClick=undefined` warning silenced ([#208](https://github.com/pyreon/pyreon/issues/208))

  The conditional handler pattern is idiomatic and was flooding the dev console with false-positive warnings:

  ```tsx
  <button onClick={condition ? handler : undefined}>  // now quiet
  ```

  The runtime correctly bails on nullish values. The warning now only fires for actually-wrong types (strings, numbers, objects) that indicate real bugs.

  ### `dangerouslySetInnerHTML` warning removed ([#208](https://github.com/pyreon/pyreon/issues/208))

  Was firing on every prop application, flooding the console on every re-render. The name `dangerouslySetInnerHTML` IS the warning — matches React's behavior (no log).

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- ## Bug Fixes

  ### CSS layer cascade fixed — rocketstyle themes now correctly override element base styles ([#206](https://github.com/pyreon/pyreon/issues/206))

  The 0.12.11 release had a CSS cascade regression where element base styles (padding, display, flex-direction) overrode rocketstyle theme styles (colors, borders, shadows). Three root causes:

  1. **`styles/index.ts` returned a plain string** instead of a `css` tagged-template result, breaking the CSS interpolation chain for responsive styles, pseudo-selectors, and @layer wrapping.

  2. **CSS layer architecture was backwards** — Elements were unlayered (highest priority per CSS cascade spec) while rocketstyle used `@layer pyreon` (lower priority). Fixed with explicit two-layer ordering: `@layer elements, rocketstyle;`. Elements use `{ layer: 'elements' }`, rocketstyle uses `{ layer: 'rocketstyle' }`.

  3. **`optimizeTheme` per-property diffing** restored — only emits changed properties per breakpoint for minimal CSS output. If `padding: 8` is the same at `xs` and `md`, only `fontSize` is emitted in the `md` media query.

  ### Dev warning false positives fixed ([#206](https://github.com/pyreon/pyreon/issues/206))

  Two dev warnings that were dead code before 0.12.11 (due to the `typeof process` dev gate bug) fired incorrectly on valid Pyreon patterns:

  - **"Component returned invalid value"** — didn't account for arrays (valid `VNodeChild[]` from Fragment) or NativeItems (from `_tpl()`). Fixed.
  - **"Reactive accessor returned function"** — fired on ALL function returns from reactive accessors, but `() => VNodeChild` IS a valid return (conditional rendering pattern). Removed — function returns are handled correctly by `mountChild`.

  ### SSR layer ordering ([#206](https://github.com/pyreon/pyreon/issues/206))

  SSR output now includes `@layer elements, rocketstyle;` declaration when layered rules are present, ensuring correct cascade in server-rendered HTML.

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- ## Bug Fixes

  ### Dev-mode warnings now fire in real browser dev builds ([#200](https://github.com/pyreon/pyreon/issues/200), [#202](https://github.com/pyreon/pyreon/issues/202))

  12 files across `@pyreon/core`, `@pyreon/runtime-dom`, and `@pyreon/router` used `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` as a dev-mode gate. This pattern is **dead code in real Vite browser bundles** because Vite does not polyfill `process`. Every wrapped `console.warn` — including Portal target validation, void element children checks, component output validation, Transition child warnings, and more — silently never fired for real users in dev mode.

  **Fixed**: all 12 files now use `import.meta.env.DEV` (the Vite/Rolldown standard), which is literal-replaced at build time. Prod bundles tree-shake the warning code to zero bytes. Dev bundles preserve it.

  **Enforced**: new `pyreon/no-process-dev-gate` lint rule (error severity, auto-fixable) prevents future regressions. Server-only packages (`@pyreon/zero`, `@pyreon/server`, `@pyreon/runtime-server`) are exempt because they always run in Node where `process` is defined.

  ### Compiler no longer crashes on circular prop-derived const chains ([#204](https://github.com/pyreon/pyreon/issues/204))

  ```tsx
  function Comp(props) {
    const a = b + props.x; // reads props.x AND references b
    const b = a + 1; // references a → circular
    return <div>{a}</div>; // ← previously: Maximum call stack size exceeded
  }
  ```

  `resolveExprTransitive` used a single `excludeVar` parameter that couldn't detect multi-step cycles (a → b → a). Replaced with a `visited: Set<string>` that tracks the full resolution chain. Cyclic identifiers are left as-is (use their captured const value). The compiler now emits a `circular-prop-derived` warning with the cycle chain and a fix suggestion.

  ### Flow `LayoutOptions` algorithm applicability documented + dev warning ([#198](https://github.com/pyreon/pyreon/issues/198), [#199](https://github.com/pyreon/pyreon/issues/199), [#200](https://github.com/pyreon/pyreon/issues/200))

  `direction`, `layerSpacing`, and `edgeRouting` are silently ignored by ELK's `force`/`stress`/`radial`/`box`/`rectpacking` algorithms. `flow.layout()` now emits a `console.warn` in dev mode when these options are set on an algorithm that ignores them. Applicability table verified empirically by running each algorithm with different values.

  ### Document-primitives: `DocDocument` accepts reactive metadata + `extractDocNode` one-step API ([#197](https://github.com/pyreon/pyreon/issues/197))

  - `DocDocument` props `title`, `author`, `subject` now accept `string | (() => string)`. Accessor functions are resolved at extraction time — each export reads live values from the store.
  - `extractDocNode(templateFn)` — one-step convenience that replaces the two-step `createDocumentExport(fn).getDocNode()` pattern.
  - **Framework fix**: `extractDocumentTree` from `@pyreon/connector-document` now correctly reads `_documentProps` from real rocketstyle primitives (previously only worked with mock vnodes in tests — a silent metadata drop that had been present since the package was created).

  ## Infrastructure

  ### Worktree builds work out of the box ([#203](https://github.com/pyreon/pyreon/issues/203))

  `bun install` now runs a `postinstall` bootstrap script that builds all packages if any `lib/` directory is missing. This fixes `Failed to resolve entry for package "@pyreon/vite-plugin"` errors in fresh git worktrees and clones. Subsequent installs are instant (~22ms no-op check).

  ### New lint rule: `pyreon/no-process-dev-gate` ([#202](https://github.com/pyreon/pyreon/issues/202))

  Rule 58 in `@pyreon/lint`. Architecture category, error severity, auto-fixable. Flags `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` patterns in browser-running packages. Server-only packages and test files are exempt.

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0

## 0.6.0

### Minor Changes

- feat(core): add `provide()` helper, widen `ComponentFn` return to `VNodeChild`, add `ExtractProps` and `HigherOrderComponent` utility types

  Migrate router, head, preact-compat to use `provide()` instead of manual `pushContext`/`popContext`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7

## 0.5.6

### Patch Changes

- feat(dx): comprehensive `__DEV__` warnings across core and runtime-dom

  feat(style): auto-append `px` to numeric style values (e.g. `{ height: 100 }` → `"100px"`), with shared `CSS_UNITLESS` set for hydration consistency

- Updated dependencies []:
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- fix: ref callback type accepts `Element | null` parameter

- Updated dependencies []:
  - @pyreon/reactivity@0.5.4

## 0.5.3

### Patch Changes

- fix: remove .d.ts post-build workaround — upstream tools-rolldown 1.15.3 fixes DTS code-split collision

- Updated dependencies []:
  - @pyreon/reactivity@0.5.3

## 0.5.2

### Patch Changes

- Add children prop to PyreonHTMLAttributes so standard JSX patterns like {condition && <div/>} type-check correctly.

- Updated dependencies []:
  - @pyreon/reactivity@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
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
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1

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

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
