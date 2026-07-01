# @pyreon/storage

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1738](https://github.com/pyreon/pyreon/pull/1738) [`59ba154`](https://github.com/pyreon/pyreon/commit/59ba154f6bb070a1a5b86ca83c39d243dfbed8c2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useStorage` / `useSessionStorage` accept an opt-in `writeDebounceMs` option that coalesces the persistence write. `localStorage.setItem` is synchronous main-thread I/O, so a value persisted on every keystroke (a draft) pays a `JSON.stringify` + `setItem` per character; `writeDebounceMs` debounces only the WRITE — the signal still updates synchronously (the UI stays reactive), the latest value wins, and a pending write is flushed on `pagehide`/`beforeunload` (via one shared idempotent listener) so the last value is never lost on tab close. `.remove()` cancels any pending write. Default (omit or `0`) keeps the synchronous write — byte-identical to prior behavior. No effect on cookie / IndexedDB (already debounced) / memory backends.

### Patch Changes

- [#1828](https://github.com/pyreon/pyreon/pull/1828) [`f107ee9`](https://github.com/pyreon/pyreon/commit/f107ee9951cc6e17fe8e4f41b4f3e19606a887fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(manifests): correct API inaccuracies that feed llms.txt / llms-full.txt / MCP `get_api`

  Several package manifests carried inaccuracies that would break copied code. Corrected
  against source + regenerated the AI-facing doc surfaces (`@pyreon/mcp`'s `api-reference.ts`
  ships the corrected `get_api` data):

  - **rx**: removed the fabricated "curried operators" model — `pipe(source, ...fns)` threads
    the value through plain `(value) => value` transforms; `filter`/`map`/`sortBy` are always
    2-arg `(source, …)` (no 1-arg curried form).
  - **hotkeys**: the real option is `enableOnInputs` (not the fabricated `enableOnFormElements`);
    scopes are not reference-counted.
  - **url-state**: options are `debounce` / `replace` (not `debounceMs` / `replaceState`); SSR
    initializes to the default value (it does not read the request URL).
  - **storage**: custom-backend methods are `get` / `set` / `remove`; serializer options are
    `serializer` / `deserializer`.
  - **document**: the format string is `google-chat` (not `gchat`).

- Updated dependencies []:
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

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- [#1345](https://github.com/pyreon/pyreon/pull/1345) [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(reactivity): `wrapSignal` primitive — fixes a latent state-tree bind bug + retires hand-rolled signal facades

  `@pyreon/reactivity` had no primitive for "a signal whose write runs a side
  effect" (persist, emit a patch, validate). So **two** packages hand-rolled the
  same signal-facade — `@pyreon/storage`'s `wrapBaseSignal` and
  `@pyreon/state-tree`'s `trackedSignal` — and a dedicated lint rule
  (`pyreon/storage-signal-v-forwarding`) existed only to police the contract.
  **A lint rule enforcing a wrapper invariant is the proof the primitive is
  missing.**

  New `wrapSignal(base, { set, update? })` builds a signal facade over `base`
  that delegates ALL reads — including the internal `_v` field and `.direct`
  that the compiler's `_bindText` / `_bindDirect` fast paths read directly,
  bypassing the call — by construction, and routes writes through `set`. The
  `_v`/`.direct` forwarding can no longer be forgotten.

  **Latent bug fixed:** `state-tree`'s `trackedSignal` forwarded neither
  `.direct` nor `_v`, so a model field bound via `{() => model.field()}` (the
  text fast path) rendered empty and stayed empty — the exact class
  `wrapBaseSignal` was created to prevent in storage, present and unfixed in
  state-tree. Routing it through `wrapSignal` fixes it. Bisect-verified by
  `state-tree/src/tests/tracked-signal-bind-contract.test.ts`.

  - `@pyreon/reactivity`: new `wrapSignal` + `WrapSignalOptions` exports.
  - `@pyreon/storage`: all 5 backends use `wrapSignal`; `wrap-base-signal.ts`
    deleted.
  - `@pyreon/state-tree`: `trackedSignal` uses `wrapSignal` (bug fix).

  `provide`/`useContext`-style user APIs are unchanged. The lint rule stays as
  defense for any future hand-rolled facade that bypasses the primitive.

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

- [#1292](https://github.com/pyreon/pyreon/pull/1292) [`5d086f0`](https://github.com/pyreon/pyreon/commit/5d086f0be77b23958748889b7ee61bcec0074a02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 85.88% → 96.63%. Annotated SSR/`isBrowser()` / `typeof indexedDB` guards + defensive null-storage checks across `clear`, `cookie`, `indexed-db`, `local`, `session`, `registry`, `utils` with `/* v8 ignore */`. Bumped vitest `branches: 85 → 95`.

## 0.28.0

### Patch Changes

- [#1194](https://github.com/pyreon/pyreon/pull/1194) [`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: move @pyreon/sized-map to packages/core/ + enrich mcp/feature/storage manifests

  **@pyreon/sized-map** — package moved from `packages/internals/` to `packages/core/`
  alongside the other foundational primitives every Pyreon package depends on. The
  package is now published to npm at 0.27.1 with OIDC trusted publishing, so the
  "internal-by-convention" location no longer fits. Updated:

  - `repository.directory` in package.json → `packages/core/sized-map`
  - `bun.lock` workspace dep entry rewritten

  Zero source/runtime changes — every consumer imports `@pyreon/sized-map` by package
  name, never by path. This is a path-only repackage; the published artifact is
  byte-identical.

  **@pyreon/feature** — manifest enriched from 2 → 5 api[] entries:

  - Added `isReference`, `extractFields`, `defaultInitialValues` (helpers exported
    from the package but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to the existing `reference()` entry

  `get_api({ package: 'feature', symbol: 'extractFields' })` now returns a real
  entry instead of 404. No runtime change.

  **@pyreon/mcp** — manifest enriched: 9 of 14 tool entries lacked `mistakes[]`.
  Added foot-gun catalogs for `get_api`, `validate`, `migrate_react`, `get_routes`,
  `get_components`, `get_pattern`, `get_changelog`, `audit_test_environment`,
  `audit_islands`. All 14 tools now have 3-4 documented mistakes grounded in real
  failure modes. No runtime change.

  **@pyreon/storage** — manifest enriched from 4 → 7 api[] entries:

  - Added `useSessionStorage`, `useMemoryStorage`, `setCookieSource` (helpers exported
    but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to existing `useCookie`, `useIndexedDB`, `createStorage`
    entries (e.g. cookie maxAge unit traps, IDB async-init flash-of-default, custom
    backend `undefined` vs `null` return contract)

  No runtime change.

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1

## 0.25.0

### Patch Changes

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

- Updated dependencies []:
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#730](https://github.com/pyreon/pyreon/pull/730) [`053c0a8`](https://github.com/pyreon/pyreon/commit/053c0a86d36b538489f1a0dd29561317eaa78c2b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(fundamentals): three correctness/leak bugs surfaced by the post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729) leak-class sweep

  Audit pass across all 22 `@pyreon/*` fundamentals packages for the same patterns that drove [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on a shared module-level stack) and [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation). Found 3 verified bugs in 2 packages (`@pyreon/hooks`, `@pyreon/storage`) plus one Class-F adjacent in `@pyreon/charts`. Each is bisect-verified or code-verified at source; each ships with an honest test or a clear in-source rationale.

  ### 1. `@pyreon/hooks` — `useDialog` crashes on unmount

  The ref callback typed its parameter as `(el: HTMLDialogElement) => void`. Pyreon's `RefCallback<T>` contract: refs fire with the element on mount AND with `null` on unmount. The pre-fix body unconditionally called `el.addEventListener('close', handler)` after assigning `dialogEl = el`, so when the ref fired with `null` on unmount, `null.addEventListener` threw `TypeError: Cannot read properties of null (reading 'addEventListener')`. Every consumer of `useDialog` crashed on unmount.

  Fix: ref param typed `HTMLDialogElement | null`; null path cleans up the previous binding and early-returns before the addEventListener call. Regression test in `useDialog.test.ts` bisect-verified: revert → `expected [Function] to not throw an error but 'TypeError: Cannot read properties of null'` was thrown; restored → pass.

  ### 2. `@pyreon/storage` — cross-tab listener detached when one consumer of N calls `.remove()`

  The `useStorage` cross-tab listener was retained ONCE per unique-key signal creation, NOT per consumer. Same-key cached returns skipped the retain. `.remove()` always released — driving the refcount below the actual consumer count.

  Real-app symptom: N components each call `useStorage('theme', 'light')`. They all share the same cached signal (correct). One component calls `.remove()` (clear storage, reset to default). The cross-tab listener is detached AND the registry entry is deleted. Now cross-tab `storage` events for 'theme' don't reach the surviving N-1 consumers — they're silently orphaned from the cross-tab pipeline.

  Fix:

  - Same-key cached returns ALSO retain the cross-tab listener (refcount now matches consumer count).
  - `.remove()` no longer deletes the registry entry — keeps it so the listener's dispatch table remains intact for surviving consumers. The registry entry is small (one Map entry per key); the residual cost is negligible vs silently breaking cross-tab sync.

  Regression test in new `cross-tab-refcount.test.ts` — bisect-verified: revert → `Expected: "dark", Received: "light"` (surviving consumer never received the cross-tab event); restored → pass.

  NOT fixed in this PR (deliberate scope): `.remove()` idempotency from the same consumer. Currently `t.remove(); t.remove()` double-releases the refcount. The fix requires per-consumer disposal state (separate wrapper per `useStorage` call), which is a larger refactor.

  ### 3. `@pyreon/charts` + `@pyreon/storage` — rejected dynamic-import / IndexedDB-open cached forever (Class F)

  Both `@pyreon/charts/src/loader.ts:loadAndRegister` and `@pyreon/storage/src/indexed-db.ts:openDB` cached `loader().then(...)` (resp. `new Promise(...)`) in a module-level `Map<string, Promise<...>>` keyed by module name / db key. Without a `.catch` clearing the entry on rejection, a single transient failure (CDN blip during initial chart render, IndexedDB quota exceeded) cached the rejected promise FOREVER — every subsequent retry of the same key returned the same cached rejection until page reload.

  Memory cost: bounded by ~50 module keys (charts) or unique `(dbName, storeName)` pairs (storage). Functional cost: the affected feature is permanently broken until reload.

  Fix: `.catch(err => { inflight.delete(key); throw err })` (same shape in both files). The `.catch` re-throws so this attempt's caller still sees the original error; subsequent retries get a fresh import / open attempt.

  Code-verified at source; no dedicated regression test in this PR (requires either mocked dynamic-import infra for charts, or a fake-indexeddb harness for storage — separable follow-ups).

  ### Audit byproducts (NOT fixed in this PR)

  - `@pyreon/code` `<CodeEditor>` component does not call `instance.dispose()` on unmount. Could be a design choice (user owns lifecycle since `instance` is an external prop) OR a documentation gap. Worth deciding deliberately, not bundled here.
  - `@pyreon/state-tree` `_hookRegistry` accepts dynamic IDs without bound — would leak if app generates IDs at runtime (uncommon — typical usage is static IDs).
  - `@pyreon/url-state` per-instance popstate listeners (no shared registry like storage has) — inefficient at scale but not a leak.
  - `@pyreon/rx` `distinct` / `scan` effects do not expose `dispose` while `debounce` / `throttle` do — minor API inconsistency only matters in out-of-component usage.

  All separately filed-worthy; deliberately scoped out of this PR.

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

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261)]:
  - @pyreon/reactivity@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- [#546](https://github.com/pyreon/pyreon/pull/546) [`1e0ba46`](https://github.com/pyreon/pyreon/commit/1e0ba46b8f4a234be4a6739b6b35d5280e8c824a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `useStorage` / `useSessionStorage` / `useCookie` / `useMemoryStorage` / `useIndexedDB` post-hydration rendering. Storage signals delegate `.direct` / `.subscribe` / `.peek` to a base signal but never forwarded the internal `_v` field that the compiler-emitted `_bindText` fast path reads. Result: JSX `<strong>{() => theme()}</strong>` rendered `<strong>light</strong>` correctly during SSR but the strong went empty post-hydration and stayed empty even after `.set()` calls — localStorage was updated, the DOM was not. Now forwards `_v` via getter so the fast path reads the live value from the underlying signal on every read. Bisect-verified at unit (6 specs) and real-Chromium e2e (4 specs).

- [#550](https://github.com/pyreon/pyreon/pull/550) [`b1d8742`](https://github.com/pyreon/pyreon/commit/b1d8742b68b9787e92916c7a88964c4c80b409ed) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Extract the shared signal-wrapper pattern from the 4 storage factories (`createStorageSignal` shared by local + session, `useCookie`, `createStorage`, `useIndexedDB`) into a single `wrapBaseSignal(sig)` helper. The helper handles the callable shape, delegated `.peek` / `.subscribe` / `.direct` / `.debug` / `.label`, and the forwarded `_v` getter that the compiler-emitted `_bindText` fast path requires. Each factory keeps its own `.set` / `.update` / `.remove` for persistence — only the shared protocol is centralized.

  No API change, no behavior change. Net -99 / +15 LOC across the 4 sites; the new helper file (~80 LOC including JSDoc) keeps the wrapper contract single-source so a future 5th backend (or extracted helper) can't forget a field. Bisect-verified at the helper layer: removing `_v` forwarding inside `wrap-base-signal.ts` fails all 6 `bind-text-compat` specs across every backend simultaneously.

- Updated dependencies []:
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- [#262](https://github.com/pyreon/pyreon/pull/262) [`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - QA audit fixes (5 HIGH + 2 MEDIUM):

  - **router**: `useBlocker` uses shared ref-counted `beforeunload` listener instead of per-blocker — prevents listener accumulation across multiple blockers
  - **router**: `destroy()` clears `_activeRouter` global ref and releases remaining blocker listeners — prevents stale router surviving in SSR/re-creation
  - **query/useSubscription**: close WebSocket BEFORE nulling handlers — prevents race where queued message fires null handler
  - **query/useSubscription**: respect `intentionalClose` when reactive deps change — user's explicit `close()` no longer gets overridden by signal change
  - **store**: plugin errors now logged with `__DEV__` console.warn instead of silently swallowed
  - **storage/IndexedDB**: initialization errors (corrupted DB, quota exceeded) now call `onError` callback and log in dev mode instead of silently falling back to default

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

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

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.
