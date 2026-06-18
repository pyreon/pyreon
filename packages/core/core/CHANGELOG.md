# @pyreon/core

## 0.34.0

### Patch Changes

- [#1601](https://github.com/pyreon/pyreon/pull/1601) [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal: remove provably-unreachable defensive branches + harden test coverage
  (no behavior change).

  `SizedMap.set`'s eviction and `Cell.listen`'s promote-to-Set both guarded a
  value that the surrounding invariant guarantees is always defined
  (`maxEntries >= 1` ⇒ non-empty map on evict; the promote branch only runs when
  a single listener exists). Replaced the dead `!== undefined` / truthy guards
  with a documented type assertion (the codebase's sanctioned pattern for
  provably-safe paths), eliminating uncoverable branches. SizedMap → 100% branch
  coverage; reactivity branch coverage improved. Added selector tests for the
  3rd-subscriber and selection-leaves-a-multi-subscriber-key paths.

  `@pyreon/head`'s `createNewTag` SSR guard is documented + `v8 ignore`d as the
  unreachable defensive guard it is (the only caller, `syncDom`, already returns
  on `document === undefined`); added a node-environment test that exercises the
  true SSR function-input path of `useHead`. head → 100% statements/functions/
  lines, 98.3% branches.

  `@pyreon/primitives`' web `<Button>` drops an uncoverable `?? {}` fallback in
  favor of a documented assertion (the `primary` key is statically defined).
  Added targeted tests for the residual web-primitive branches — plain-value
  (non-signal) `value`/`checked`, the asset-name `src` dispatch, and the defensive
  guard false-paths in Field/Text/Press/WebView. primitives → 100% across all four
  metrics.

  `@pyreon/runtime-server` gains SSR edge-case + dev-mode/prod-mode coverage
  (documenting that `__DEV__` is a module-load constant, so both gate sides need
  separate NODE_ENV runs) and three documented `v8 ignore`s for genuinely-
  unreachable defensive arms (the outside-ALS context-stack fallback, the
  For-symbol function-each the For component pre-resolves, the stream context-store
  nullish fallback). statements/functions/lines → 98%+, branches 88.4% → 95.2%
  (a pre-existing RED branch gate, now green). No behavior change.

  `@pyreon/create-zero`'s `listFiles` walk uses a plain `else` for the
  non-directory case (a template tree is files-or-dirs only — no symlinks), and
  gained `substitute` tests covering the unknown-`{{key}}`-kept-verbatim branch.
  create-zero → 100% statements/functions/lines, 98.7% branches (one defensive
  unreachable branch remains in the dep-version resolver).

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Minor Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

### Patch Changes

- [#1442](https://github.com/pyreon/pyreon/pull/1442) [`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926) Thanks [@vitbokisch](https://github.com/vitbokisch)! - JSX type: `aria-current` now accepts a function accessor (`() => Booleanish | 'page' | 'step' | …`) for reactive values, matching the shape of `aria-selected` / `aria-disabled` / `aria-hidden`. Previously the type was static-value-only, forcing consumer code to cast with `as never` to use `aria-current={() => activeSlug() === h.slug ? 'location' : undefined}` (the canonical reactive-attr shape across Pyreon components).

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Minor Changes

- [#1348](https://github.com/pyreon/pyreon/pull/1348) [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(core): `removeUndefinedProps` — the reactive-prop-aware undefined filter moves into core, retiring two hand-rolled copies

  `@pyreon/core/props.ts` owns Pyreon's reactive-prop encoding (`_rp`,
  `makeReactiveProps`, `REACTIVE_PROP`) and the descriptor-preserving merge/split
  utilities (`mergeProps`, `splitProps`). It did NOT own the **one remaining
  operation on that encoding** every prop-forwarding HOC needs: "copy a props
  object, dropping `undefined` data keys while preserving getter-shaped reactive
  props verbatim."

  So `@pyreon/attrs` and `@pyreon/rocketstyle` each hand-rolled it
  (`utils/attrs.ts:removeUndefinedProps`) — byte-identical bodies. **And the
  `@pyreon/attrs` copy historically shipped as a value-copy** (`result[key] =
props[key]`), which fires getter-shaped reactive props at HOC-setup time and
  collapses the live signal to a static snapshot — silently breaking reactive-prop
  forwarding for any consumer using `attrs(Component)` directly (its own docstring
  records this). Two divergent copies of an operation core should own = the exact
  shape that lets one regress while the other stays correct.

  New `removeUndefinedProps` is exported from `@pyreon/core`, next to `mergeProps`
  / `splitProps` / `makeReactiveProps`. Both `@pyreon/attrs` and
  `@pyreon/rocketstyle` now re-export it from core (call sites import from
  `../utils/attrs` unchanged); the duplicate implementations are deleted.

  - `@pyreon/core`: new `removeUndefinedProps` export (+ manifest entry, 6 specs).
  - `@pyreon/attrs`: `utils/attrs.ts` re-exports from core (hand-roll deleted).
  - `@pyreon/rocketstyle`: `utils/attrs.ts` re-exports from core (hand-roll deleted).

  Bisect-verified (`core/src/tests/remove-undefined-props.test.ts`): replacing
  the descriptor-copy with a value-copy fails the getter-preservation specs (the
  getter fires + the prop becomes a static value); restored → 6/6. No behavior
  change — both copies were already the correct descriptor-copy form.

- [#1338](https://github.com/pyreon/pyreon/pull/1338) [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07) Thanks [@vitbokisch](https://github.com/vitbokisch)! - refactor(core): owner-based context — replace the global context stack

  Context resolution moved from a global mutable `Map[]` stack to an **owner
  chain**: each mounted component's `EffectScope` doubles as a context owner
  (`_parent` + `_contexts`), linked by the renderer so the chain mirrors the
  component tree. `provide()` writes onto the current owner; `useContext()` walks
  the owner chain; context is released when the scope is disposed.

  This deletes ~190 lines of snapshot / restore / dedup / identity-removal
  machinery whose only job was to fake tree-position across deferred mounts
  (`<Show>` / `<For>`) — and which was itself the source of the 321k-frame leak,
  the position-pop bug, and orphan frames. `@pyreon/core/src/context.ts` shrank
  425 → 236 lines, and the entire context-stack bug class is now structurally
  impossible.

  - **`@pyreon/reactivity`** (minor): `EffectScope` gains `_parent` / `_contexts`
    - `provideContext` / `lookupContext`; new exports `getContextOwner`,
      `setContextOwner`, `runWithContextOwner`.
  - **`@pyreon/core`** (minor): `provide` / `useContext` are owner-based
    (owner-first, stack-fallback for SSR + the `*-compat` layers' own
    stack-based provide/inject). The internal `captureContextStack`,
    `restoreContextStack`, and the `ContextSnapshot` type are no longer exported.
  - **`@pyreon/runtime-dom`** (patch): `mount` / `hydrate` establish the owner
    chain per component; `mountReactive` captures a single owner reference
    instead of a deduped stack snapshot.

  SSR is unchanged — it keeps the request-scoped stack (a synchronous top-down
  walk needs no band-aids). `provide` / `useContext` user APIs are unchanged.

  Perf (tight A/B vs the stack model): headline component create is neutral
  (within noise); the deferred-mount `<Show>` path is ~4% faster (the dedup +
  restore work is gone). Verified: ~3,200 unit tests + verify-modes 19/19 + 156
  real-Chromium e2e. A latent cross-test context leak (a `RouterContext` frame
  bleeding between tests) was exposed and fixed by the per-mount isolation.

### Patch Changes

- [#1349](https://github.com/pyreon/pyreon/pull/1349) [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(core): unblock Coverage (Full) — add 7 tests for owner-based context ([#1338](https://github.com/pyreon/pyreon/issues/1338))

  PR [#1338](https://github.com/pyreon/pyreon/issues/1338)'s owner-based context refactor consolidated 600 lines into 250 but
  the new arms (owner-present branches in `provide` / `withContext`, the
  `setSnapshotCapture` round-trip, defensive `popContext` / `removeContextFrame`
  when stack is empty / frame missing) had no direct unit coverage. `@pyreon/core`
  fell to 94.74% statements + 93.51% functions, failing both the package
  threshold and unblocking nobody's PR.

  This hotfix adds `context-coverage.test.ts` with 7 specs:

  - `withContext` owner-present path (lines 211-214)
  - `provide` owner-present path (lines 197-198)
  - `withContext` no-owner SSR fallback throws-and-pops correctly
  - `popContext` no-op when stack is empty (defensive arm)
  - `removeContextFrame` no-op when frame not on stack (lastIndexOf -1)
  - `removeContextFrame` finds + removes by identity (the load-bearing path)
  - SSR-style nested push/pop walks correctly

  Coverage delta:

  - statements 94.74% → 96.10% ✅
  - functions 93.51% → 94.44% ✅
  - branches 93.11% → 94.01%
  - lines 96.16% → 97.51%

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0

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

- [#1316](https://github.com/pyreon/pyreon/pull/1316) [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - refactor(core,runtime-dom,runtime-server): single-source the URL-attribute injection guard

  Extracts `URL_ATTRS`, `UNSAFE_URL_RE`, and `isSafeImageDataUri` into
  `@pyreon/core/url-guard` (`@internal`), imported by both renderers — the client
  `@pyreon/runtime-dom` (`setStaticProp` + the DOMParser sanitizer) and the SSR
  `@pyreon/runtime-server` (`renderProp`).

  Previously each renderer carried an independent copy of the guard. That drift is
  exactly what shipped the `data:image/*` placeholder allowlist to the client
  ([#1212](https://github.com/pyreon/pyreon/issues/1212), 0.28.1) but not to SSG static HTML (fixed in [#1314](https://github.com/pyreon/pyreon/issues/1314)) — collapsing both
  into one source means the two can no longer diverge. `isSafeImageDataUri` now
  takes a string `tagName` (matched case-insensitively), so the client passes
  `el.tagName` and the server passes the JSX tag.

  No behavior change: the exhaustive allow/block matrix now lives once in
  `@pyreon/core`'s `url-guard.test.ts`; each renderer keeps its existing matrix as
  a wiring regression guard, and the full `<Image>` → SSR placeholder pipeline is
  locked by a new `@pyreon/zero` integration test.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0)]:
  - @pyreon/reactivity@0.33.0

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

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

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

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA

  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1

## 0.25.0

### Patch Changes

- [#858](https://github.com/pyreon/pyreon/pull/858) [`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Extract `defineCrossModuleState(key, init)` helper. The 5 inlined `Symbol.for(...) ?? init; if (!g[KEY]) g[KEY] = …` blocks in `@pyreon/core`'s `lifecycle.ts` / `component.ts` / `context.ts` / `telemetry.ts` / `props.ts` (from [#855](https://github.com/pyreon/pyreon/issues/855)) collapse to one helper call per state var. Same `Symbol.for` keys preserved — byte-identical runtime behavior; the existing regression tests in `cross-module-state.test.ts` pass unchanged.

  The helper lives in `@pyreon/reactivity` (the lowest layer in the dep order — standalone, every other package transitively depends on it) so EVERY package can apply the same pattern. `@pyreon/core` re-exports it for backward-compat with the previous PR. Follow-up PRs will use this to harden `@pyreon/reactivity`'s own module-level state (activeEffect, batch state, scope, tracking deps), and then `@pyreon/router`, `@pyreon/store`, `@pyreon/storage`, etc.

- [#886](https://github.com/pyreon/pyreon/pull/886) [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Revert PR [#855](https://github.com/pyreon/pyreon/issues/855)'s `Symbol.for`-on-`globalThis` pattern in `@pyreon/core`'s 5 state files (`lifecycle.ts`, `component.ts`, `context.ts`, `telemetry.ts`, `props.ts`) — restore plain `let _foo = …` module-scope state (PR D of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  The new architecture (PRs A + B) makes this workaround unnecessary AND harmful:

  - **Bundler prevents** (PR B = [#884](https://github.com/pyreon/pyreon/issues/884)): `@pyreon/vite-plugin` injects `resolve.dedupe` for every `@pyreon/*` package — one instance per heap by construction.
  - **Sentinel detects** (PR A = [#883](https://github.com/pyreon/pyreon/issues/883)): every `@pyreon/*` package calls `registerSingleton(...)` at module load — anything that slips through prevention throws a fail-loud Error.

  PR [#855](https://github.com/pyreon/pyreon/issues/855)'s Symbol.for pattern had real costs that the new architecture eliminates:

  1. **Pollutes `globalThis`** with framework state symbols (visible to userspace, devtools, other libraries).
  2. **Breaks SSR per-request isolation** — state is process-global, ALS-backed runtime-server has to do MORE work to compensate.
  3. **Breaks test isolation** — `vi.resetModules()` doesn't reset `globalThis` state.
  4. **No enforcement** — new contributors writing `let _foo = …` silently regressed the contract.

  The `defineCrossModuleState` helper from [#858](https://github.com/pyreon/pyreon/issues/858) stays exported from `@pyreon/reactivity` and re-exported from `@pyreon/core` as a documented opt-in escape hatch for HMR state survival — it's no longer the framework contract.

  `packages/core/core/src/tests/cross-module-state.test.ts` is deleted (asserted on `Symbol.for` keys that no longer exist).

  **Ordering invariant** (per the plan): PR D MUST NOT merge until BOTH PR A ([#883](https://github.com/pyreon/pyreon/issues/883)) and PR B ([#884](https://github.com/pyreon/pyreon/issues/884)) are in `main` AND have been observed in canary for at least one week without incident. If a regression surfaces during canary, PR D simply doesn't ship — the γ workaround stays in `@pyreon/core` as a fallback while the regression is debugged.

  Validation:

  - `@pyreon/core` tests: 531 pass (was 538 — drop is the 7 deleted `cross-module-state.test.ts` specs that asserted on the now-removed Symbol.for keys)
  - Full core-layer (`reactivity`, `core`, `router`, `runtime-dom`, `runtime-server`, `head`, `server`): 2,548 tests pass
  - SSR per-request isolation via `runtime-server.setContextStackProvider()` preserved (function unchanged; just its underlying state moved from globalThis to module-scope)

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0

## 0.24.6

### Patch Changes

- [#855](https://github.com/pyreon/pyreon/pull/855) [`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777) Thanks [@vitbokisch](https://github.com/vitbokisch)! - # Cross-module `@pyreon/core` duplication — fundamentally correct fix

  **Fundamentally correct fix for the cross-module `@pyreon/core` duplication bug** that produced the dev-404 SSR `provide()` outside-setup warning storm reported in 0.24.4 (the same bug PR [#850](https://github.com/pyreon/pyreon/issues/850)'s `ssr.noExternal` papered over for Vite specifically). Same shape as `@pyreon/head`'s 0.21.0 → 0.22.0 collapse to one canonical module instance.

  ## Two-layer architecture

  ### Layer 1 — Root cause: strip `bun` + `src` from published packages (`scripts/publish.ts`)

  The `bun` condition exists to point WORKSPACE consumers at TypeScript source (`./src/index.ts`) for HMR + fast refresh during framework development. It was never meant for published consumers. Vite's `[bare]` resolver honors `bun` (→ `src/`) while Vite's `[package entry]` resolver IGNORES it (→ `lib/`) — that's how the same `@pyreon/core` could resolve to two different files in one process. Every `provide()` outside-setup warning was that structural duplication.

  `scripts/publish.ts` now performs TWO surgeries on every package's `package.json` BEFORE `npm publish` (Phase 2 already restores the workspace original after — no workspace impact):

  1. **`exports`**: strip the `bun` condition from every entry + nested subpath. Published packages emit ONLY `import` + `types`, so consumers' bundlers have ONE canonical entry. **Single resolution path → single module instance.**
  2. **`files`**: drop `src` from the array. Once `bun` is gone from exports, `src/` is unreachable through the package name — shipping it inside the tarball is pure waste (50KB-2MB per package × 53 framework packages ≈ multi-megabytes of dead weight per install). Tarball-only contains `lib/` + README + LICENSE post-strip.

  Both helpers extracted to [`scripts/lib/strip-bun-condition.ts`](scripts/lib/strip-bun-condition.ts) — 11 unit specs lock the contract (recursive nested-condition handling, array preservation, primitive pass-through, multiple `src`-form variants, real `@pyreon/core` canonical-shape strip).

  ### Layer 2 — Defense-in-depth: `Symbol.for`-keyed shared state inside `@pyreon/core`

  Even with Layer 1 eliminating the bug for npm consumers, workspace dev still uses the `bun` condition (correctly — that's the whole point of workspace dev). Layer 2 makes `@pyreon/core` defensive against ANY future module-duplication scenario by hosting all 5 module-level mutable state vars on `globalThis` under `Symbol.for` keys:

  | File           | State var                          | Symbol.for key                     |
  | -------------- | ---------------------------------- | ---------------------------------- |
  | `lifecycle.ts` | `_current` (lifecycle hooks)       | `pyreon-core/lifecycle-state`      |
  | `component.ts` | `_errorBoundaryStack`              | `pyreon-core/error-boundary-state` |
  | `context.ts`   | `_defaultStack` + `_stackProvider` | `pyreon-core/context-stack-state`  |
  | `telemetry.ts` | `_handlers` (error handlers)       | `pyreon-core/error-handlers-state` |
  | `props.ts`     | `_idCounter` (createUniqueId)      | `pyreon-core/id-counter-state`     |

  Same pattern as the existing `_bridgeHost = globalThis as PyreonErrorBridge` in `telemetry.ts:113` and `Symbol.for('pyreon:native-compat')` in `compat-marker.ts`. Both module instances reach the SAME state object via the Symbol.for lookup.

  Pattern:

  ```ts
  interface LifecycleState {
    current: LifecycleHooks | null;
  }
  const KEY = Symbol.for("pyreon-core/lifecycle-state");
  const g = globalThis as Record<symbol, unknown>;
  const _state: LifecycleState = (g[KEY] as LifecycleState | undefined) ?? {
    current: null,
  };
  if (!g[KEY]) g[KEY] = _state;
  ```

  The `if (!g[KEY])` guard ensures the FIRST module instance creates the state; subsequent instances see it and use it.

  ## Why two layers is the fundamentally correct architecture

  | Scenario                                                                       | Layer 1 (strip)       | Layer 2 (Symbol.for) |
  | ------------------------------------------------------------------------------ | --------------------- | -------------------- |
  | Production npm consumer (Vite)                                                 | ✅                    | ✅                   |
  | Production npm consumer (Webpack/Next.js/Rolldown/Parcel/Bun)                  | ✅                    | ✅                   |
  | Workspace dev (Pyreon framework contributor)                                   | ❌ (bun still active) | ✅                   |
  | Subdep version mismatch (different consumers have different versions vendored) | partial               | ✅                   |
  | Future bundler resolver changes                                                | partial               | ✅                   |
  | Multiple Pyreon apps in same process (micro-frontends)                         | partial               | ⚠️ shared state      |

  Layer 1 is the PRIMARY fix — it eliminates the bug class at the source for ~100% of npm consumers. Layer 2 is the safety net — catches workspace-dev cases + future scenarios Layer 1 doesn't reach.

  **Known limitation (documented, accepted):** Layer 2 uses `globalThis` so multiple Pyreon apps in the same JS process (e.g. micro-frontends) would share state. This is not a supported scenario today; if it becomes one, the path forward is app-scoped contexts (separate architecture, deferred).

  ## Public API impact

  **Zero.** Every existing public API (`setCurrentHooks` / `getCurrentHooks` / `onMount` / `onUnmount` / `onUpdate` / `onErrorCaptured` / `pushErrorBoundary` / `popErrorBoundary` / `dispatchToErrorBoundary` / `pushContext` / `popContext` / `useContext` / `setContextStackProvider` / `registerErrorHandler` / `reportError` / `createUniqueId` / `_resetIdCounter`) works identically. Only the state's STORAGE LOCATION changed.

  Workspace dev workflow unchanged — `bun` condition still routes framework src/ imports to TypeScript source files. Only publish-time package.json is mutated (then restored).

  ## Verification

  - **7 unit specs** for `stripBunCondition` covering recursive nesting, arrays, primitives, real `@pyreon/core` shape.
  - **7 regression specs** for the Symbol.for state hosting in [`tests/cross-module-state.test.ts`](packages/core/core/src/tests/cross-module-state.test.ts):
    - Each state var reachable at its `Symbol.for` key on `globalThis`
    - Public APIs (`setCurrentHooks`, `pushContext`, `pushErrorBoundary`, `registerErrorHandler`, `createUniqueId`) all mutate the SHARED state object
    - "Scope invariant": simulating a second module instance via the same `Symbol.for` lookup returns the SAME state object (not a new one)
  - **Bisect-verified**: stashed all 5 source-file Symbol.for changes → 7/7 cross-module-state specs fail with `expected undefined to be defined`. Restored → all pass + 531 existing core tests pass + downstream `router` / `head` / `runtime-dom` / `runtime-server` / `reactivity` clean.

  ## Relationship to PR [#850](https://github.com/pyreon/pyreon/issues/850)

  Complementary. PR [#850](https://github.com/pyreon/pyreon/issues/850) (`ssr.noExternal` in `@pyreon/vite-plugin`) is good Vite practice and fixed the immediate Vite consumer issue. This PR makes the framework structurally correct at the source — the bug class is eliminated regardless of bundler config.

- Updated dependencies []:
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.3

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
