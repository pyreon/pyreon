# @pyreon/dnd

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- [#2234](https://github.com/pyreon/pyreon/pull/2234) [`3a23643`](https://github.com/pyreon/pyreon/commit/3a23643d28c9c7d603f535324b9cbbd0111d2c60) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useSortable` now disposes its **container** registration on `containerRef(null)` / re-register, plus a wrapper-overhead benchmark.

  - **Fix — container-registration leak (the F3 per-item leak's sibling).** `useSortable`'s `containerRef` registers three teardowns per element (auto-scroll + the reorder drop-target + a `keydown` listener). The `null`/re-register path was a pure no-op — `containerRef(null)` (fired on unmount) disposed nothing, and `containerRef(el2)` after `containerRef(el1)` pushed three more registrations without disposing the first. A collapsible board whose `<ul ref={containerRef}>` sits behind a `<Show>` (with the hook in the parent) re-fires `containerRef` on every toggle, leaking the auto-scroll + drop-target + keydown listener on each detached element until the whole sortable unmounted. `containerRef` now disposes the prior container registration on both `null` and re-register — symmetric with the per-item disposal — and `onCleanup` drains whatever remains. No API change. Bisect-verified: on the unfixed code three container-leak specs fail with `expected vi.fn() to be called 1 times, but got 0 times`; after the fix all pass.

  - **New — wrapper-overhead benchmark** (`bun run bench`, `bench/dnd-wrapper-tax.ts`). Measures the "wrapper tax": how much JS the signal-driven hooks add over a hand-rolled Pyreon+pdnd integration wiring the same reactive state. Runs the **real** pragmatic-drag-and-drop build under happy-dom, per-`(op × impl)` process isolation, correctness gate, pooled median + bootstrap CI95. Verdict: **near-zero tax** — `useDraggable` / `useDroppable` / `useSortable`-item mount→unmount lifecycles tie a hand-rolled baseline (CI overlap); `useDragMonitor` adds ~one closure allocation per mount (~40ns); per drag-event dispatch is at-or-near noise. Reactive DnD at ~raw-pdnd cost.

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- [#1959](https://github.com/pyreon/pyreon/pull/1959) [`45791ad`](https://github.com/pyreon/pyreon/commit/45791ad573960d6d6741fbdc3621b24210b3fbd1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore(deps): update dependencies to latest across the workspace

  Bumps every workspace package's dependencies to their latest versions. Notable
  consumer-visible runtime bumps (all validated — typecheck + package tests +
  full lib build green):

  - `@pyreon/dnd`: `@atlaskit/pragmatic-drag-and-drop` 1→2, `-auto-scroll` 2→3,
    `-hitbox` 1→2 (major; 129 tests pass)
  - `@pyreon/zero-content`: `shiki` 1→4 (major; 732 tests pass)
  - `@pyreon/query` / `@pyreon/virtual`: `@tanstack/*` → 5.101.2 / virtual-core 3.17.3

  Dev-only / benchmark-competitor bumps (not shipped to consumers): `@casl/ability`
  6→7, `i18next` 24→26 (both benches re-run clean, correctness gates pass),
  `@types/node` 26, `@vitus-labs/tools-*`, `typescript` (real-bench aligned to 6).

  Coherence overrides added for version-coupled ecosystems (the codemirror family
  and vite/vitest must share one version): `@codemirror/state@6.6.0` and
  `vite@8.0.16` pinned; `@tanstack/query-core` override → 5.101.2. Held back:
  codemirror patch bumps in `@pyreon/code` (version-coupled with 18 transitive
  lang-\* packages), `sharp` peer range kept permissive (`^0.33 || ^0.34 || ^0.35`).

- [#2019](https://github.com/pyreon/pyreon/pull/2019) [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Manifest completion — the final 8 real-API packages join the manifest-driven docs pipeline (llms.txt / llms-full.txt / MCP api-reference now cover them; each ships a bisect-locked manifest-snapshot test). Several stale README claims found during the source-grounded migration were corrected in the same pass.

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- [#1534](https://github.com/pyreon/pyreon/pull/1534) [`3f551b5`](https://github.com/pyreon/pyreon/commit/3f551b5187511a3325d426fcad7696d2cc530e09) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`.

  - **@pyreon/hooks** (7 sites): `useWindowResize`, `useBreakpoint`, `useScrollLock`, `useIsomorphicLayoutEffect`, `useInfiniteScroll`.
  - **@pyreon/dnd** (5 sites): the SSR-guard early-returns in `useDraggable`, `useDroppable`, `useSortable`, `useFileDrop`, `useDragMonitor`.

  Behavior is identical — `isServer`/`isClient` are defined as `typeof document {===,!==} 'undefined'` — but the framework now uses its own primitive instead of dogfooding the pattern its own lint rule (`pyreon/prefer-isserver`) flags. No public API change.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.29.0

### Patch Changes

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

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

- [#1293](https://github.com/pyreon/pyreon/pull/1293) [`c9aca89`](https://github.com/pyreon/pyreon/commit/c9aca89179429e062a3e668d500f6fa1446180b5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 91.87% → 96.74%. Annotated structurally-unreachable defensive guards in dnd hooks with `/* v8 ignore */`: disposed-during-setup branches in `use-draggable`/`use-droppable`/`use-file-drop`, defensive findIndex/null/edge ternaries + canMonitor predicate in `use-sortable`/`use-drag-monitor`. Bumped vitest `branches: 85 → 95`.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#1051](https://github.com/pyreon/pyreon/pull/1051) [`a164b67`](https://github.com/pyreon/pyreon/commit/a164b6729081ab40af6401a00caabbb442061d37) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(dnd): guard deferred pdnd setup against a mount→unmount race (`useDraggable`/`useDroppable`/`useFileDrop`)

  These hooks defer their pragmatic-drag-and-drop registration to a `queueMicrotask(setup)` so the element ref is populated, while registering `onCleanup` synchronously. If the hook unmounted BEFORE the microtask ran (fast `<Show>`/conditional toggle, keyed-list churn), `onCleanup` fired with the cleanup still undefined (a no-op) — then the microtask ran `setup()` and registered pdnd anyway. That registration (plus its document-level listeners) was created after cleanup already ran, so it leaked for the page lifetime.

  A `disposed` flag is now set in `onCleanup`; `setup()` bails if disposed. Bisect-verified (`tests/use-draggable-race.test.ts`): disposing before the deferred setup runs registers pdnd 0 times post-fix vs 1 pre-fix; a normal mount still registers once. 116/116 dnd tests pass. (`useSortable` already registered synchronously and was unaffected.)

- [#1117](https://github.com/pyreon/pyreon/pull/1117) [`fd3422c`](https://github.com/pyreon/pyreon/commit/fd3422cfec1d48c8b382f8512ed44f8256887931) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(form,dnd): batch() 6 multi-signal write sites surfaced by `pyreon/no-unbatched-updates`

  Lint follow-up to PR [#1110](https://github.com/pyreon/pyreon/issues/1110) (fundamentals R2/R3/R4 batch audit) — six sites in `use-form.ts` + `use-sortable.ts` were missed by the manual audit but caught by the `pyreon/no-unbatched-updates` lint rule.

  Each `batch()` wrap collapses N notify cycles to 1 per event:

  - **`@pyreon/form` `use-form.ts`** (4 sites):
    - `field.reset()` — 4 signal writes per call (value / error / touched / dirty).
    - `validate()` clear-all-errors loop — N writes per validate.
    - `validate()` schema-error apply loop — N writes per validate.
    - `setInitialValues()` per-field loop — 4×N writes per call (typical use is async-prefill landing post-mount).
  - **`@pyreon/dnd` `use-sortable.ts`** (3 sites):
    - Container `onDrop` reset (activeId/overId/overEdge) — 3 writes per drop.
    - Per-item `onDrop` reset in `queueMicrotask` — 3 writes per drop.
    - `onCleanup` final reset — 3 writes per sortable dispose.

  Bisect-proven via a real `@pyreon/reactivity` synthetic harness: 4 un-batched signal writes fire 4 effect re-runs; 4 batched writes fire 1. The optimization is observable subscriber-side; consumers reading 2+ form fields together (typical for validation hints) see one re-render per `field.reset()` instead of four.

  Also documents one lint false positive (`runValidation` — 3 `errorSig.set()` calls in 3 mutually exclusive branches) with an inline `pyreon-lint-disable-next-line` + rationale comment. The lint rule counts function-scope total writes, not per-branch fan-out.

  Lint count: `@pyreon/form` 4→0 (+1 documented exemption), `@pyreon/dnd` 3→0.

- [#982](https://github.com/pyreon/pyreon/pull/982) [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kanban audit (T4.2) — close all 6 walls (W18-W23).

  **W23 — P0 reactivity bug fix** (`@pyreon/reactivity`). `runUntracked`
  now suspends `_innerEffectCollector` in lock-step with `activeEffect`.
  Child component effects created inside `mountFor`'s `runUntracked` wrap
  (PR [#490](https://github.com/pyreon/pyreon/issues/490)) were auto-registered as inner effects of the For's outer
  effect, then silently disposed on the For's next re-run — breaking
  every effect-derived subscription in the child subtree on the first
  source-signal mutation. Was a SHOWSTOPPER for any Trello/Notion/Linear/
  spreadsheet-shaped app. Bisect-verified.

  **W21 — incidentally fixed by W23 patch.** For-with-computed-indirection
  shapes (nested inside outer For-with-mutating-source) now propagate
  correctly.

  **W22 — documented** (`@pyreon/core`). `For` JSDoc + `ForProps.children`
  JSDoc now carry the canonical fix pattern (pass ID, child reads its own
  data from store).

  **W18 — cross-list groupId** (`@pyreon/dnd`). `useSortable` accepts an
  optional `groupId` — two instances with the same `groupId` share a drop
  universe via `onCrossListDrop(item)` (source removes) +
  `onCrossListReceive(item, index)` (destination inserts). No `groupId`
  keeps per-instance isolation (backward compat).

  **W19 — auto-inject entry-client** (`@pyreon/zero`). `transformIndexHtml`
  hook injects `<script type="module" src="${entryClient}">` before
  `<!--pyreon-scripts-->` automatically. Configurable via
  `zero({ entryClient: '/src/main.ts' })` or `entryClient: false` to opt
  out. Default `/src/entry-client.ts`.

  **W20 — already covered** by existing `pyreon/no-map-in-jsx` rule —
  test extended for the reactive-accessor shape `{() => items().map(...)}`.

  Closes the kanban example end-to-end. Full add → delete → filter →
  multi-mutation → reload sequence is green in real-Chromium e2e.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- [#612](https://github.com/pyreon/pyreon/pull/612) [`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security / memory-leak / correctness hardening sweep across core, fundamentals, and zero. 12 source-grounded defects fixed; every fix has a bisect-verified regression test (revert → fail → restore → pass).

  **Security (prototype pollution / XSS / DoS)**

  - `@pyreon/reactivity` `reconcile()` + `createStore` set trap — a documented "apply an untrusted API response into a store" path (`reconcile(JSON.parse(body), store)`) had no `__proto__`/`constructor`/`prototype` guard. Added on both the write and stale-key-removal passes + defense-in-depth in the proxy set trap.
  - `@pyreon/i18n` `addMessages` — `nestFlatKeys` (dotted-key expansion) ran BEFORE `deepMerge`, so deepMerge's own pollution filter never saw the dotted form; `__proto__.x` walked into `Object.prototype` and wrote onto it. Message JSON is routinely CDN/community-sourced. Guarded.
  - `@pyreon/document` HTML renderer — `language` was interpolated raw into `<html lang="…">` and `styleStr` emitted string values raw into `style="…"`; a CMS/author-supplied value containing `"><script>` broke out → stored XSS. `lang` is now charset-restricted + escaped; style values route through the renderer's existing `sanitizeCss`.
  - `@pyreon/zero` rate-limit — `MAX_STORE_SIZE` was a declared-but-unenforced constant; the cleanup only evicted EXPIRED entries, so a flood of unique keys within one window (spoofable `X-Forwarded-For`) grew the Map unbounded — an unauthenticated memory-exhaustion DoS. Added a hard cap with oldest-first eviction (mirrors the ISR cache's proven `set()`).
  - `@pyreon/zero` ISR — the cache stored ANY response and replayed it as a 200 for the whole revalidate window: a transient 5xx/3xx became a self-inflicted outage, and a `Set-Cookie` response was replayed cross-user. Now only 2xx, cookie-free responses are cached; everything else passes through verbatim with its original status (`x-isr-cache: BYPASS`).
  - `@pyreon/server` `prerender` + `@pyreon/zero` SSG plugin (3 sites) — the path-traversal guard used a bare `startsWith(resolve(outDir))` (string-prefix, not path containment): a `getStaticPaths` slug resolving to the SIBLING `dist-evil/` passed and wrote outside the output root. Now separator-terminated containment (`isInsideDist`).
  - `@pyreon/zero` API-route matcher — dangerous param names from the route pattern guarded (defense-in-depth; consistent with the reconcile / i18n guards).

  **Memory leaks**

  - `@pyreon/reactivity` `signal._d` — direct-updater disposal nulled an array slot but never compacted, so a long-lived signal (theme/locale/auth, or signals read in `<For>` rows) bound by churning components accumulated one permanent dead slot per ever-mounted binding — an app-lifetime leak that ALSO degraded the signal-write hot path (`notifyDirect` iterated O(total-ever), not O(live)). Switched to a `Set` (same as `_s`): O(1) disposal, O(live) iteration, bounded growth. Proven structurally — `_d.size` stays 0 after 10 000 register/dispose cycles.
  - `@pyreon/dnd` `useSortable` — `itemRef` pushed every pdnd registration onto a shared array and the unmount (`ref(null)`) branch was a no-op, so a churning `<For>` sortable (todo list / kanban — the documented usage) leaked every removed item's draggable/dropTarget registration until the whole sortable unmounted. Now per-key disposal on unmount and re-register.
  - `@pyreon/zero` ISR — a hung revalidation handler pinned its key in the in-flight set forever (`finally` never ran), so the entry could never recover from stale. Background revalidation is now timeout-bounded (`ISRConfig.revalidateTimeoutMs`, default 30 s).

  **Correctness / silent-failure**

  - `@pyreon/router` `stringifyLoaderData` — the cycle detector used an all-seen `WeakSet` that was never pruned, so a shared (DAG) reference — extremely common, e.g. `{ author: user, lastEditor: user }` from an ORM — falsely threw "circular reference" and 500'd the SSR response. Replaced with true ancestor-path detection (the original code's own comment anticipated exactly this remedy). **Behaviour change (bug fix, strictly more permissive):** payloads that previously 500'd now serialize; real cycles still throw.
  - `@pyreon/server` `processTemplate` — used `String.prototype.replace` with string replacements, so rendered HTML containing literal `$&` / `$$` / `` $` `` / `$'` (prices, code, math) was corrupted by regex-pattern substitution. Switched to function replacements.
  - `@pyreon/i18n` `interpolate` — a serialization failure (circular value, throwing `toString`) was swallowed silently, rendering `{{key}}` to end users with no signal. Now dev-warns (fallback behaviour unchanged).
  - `@pyreon/query` `useSSE` — the reactive effect unconditionally reset `intentionalClose = false`, so an explicit `close()` was silently overridden by any later reactive `url`/`enabled` change. Now respects `intentionalClose` (mirrors `useSubscription`); `reconnect()` is the explicit resume.

  **Disclosures (honest scope)**

  - **An attempted SWR-swallow fix (surface the empty `.catch` via `__DEV__` warn + `_onError`) was REVERTED from this PR.** Probing empirically proved `revalidateSwrLoaders` is invoked **0 times** even by the canonical `staleWhileRevalidate` nav pattern: `resolveRoute` returns fresh `RouteRecord` objects per resolution, so `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate is never true across navigations — the SWR branch is **dead code**, and the existing "revalidates in background" test's count actually comes from the blocking path running twice. Adding error-surfacing to provably-unreachable code is not hardening (and it dropped router coverage). **The real bug — `staleWhileRevalidate` is effectively non-functional for the nav-away/back case (record-identity-keyed gate)** — is a distinct, significant finding whose correct fix (key the gate by a stable path/loaderKey) is a non-trivial router behaviour change deserving its own focused, aligned PR. Documented in `router/src/tests/loader.test.ts` as a flagged follow-up; deliberately not bundled here (scope/risk).
  - One audit finding (`decodeKeyFromMarker`) was investigated and **dropped as a false positive** — `%2D` never appears in `encodeURIComponent` output, so the manual substitution is uniquely reversible.
  - Z5 (API-route param guard) is defense-in-depth: a string param value assigned to `__proto__` is a silent JS no-op (not exploitable); the guard prevents the real own-prop shadow for `constructor`/`prototype` and matches the repo-wide convention.

  Validation: lint 0 errors; typecheck clean (8 touched packages); gen-docs in sync; audit-types `--all --strict` 0 HIGH; bundle-budgets 54/54 within budget. Per-package suites all green (reactivity 294, router 520, server 78, i18n 155, document 269, dnd 111, query 151, zero 884).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

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
