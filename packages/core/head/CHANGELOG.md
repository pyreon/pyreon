# @pyreon/head

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/runtime-server@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/runtime-server@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/runtime-server@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

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
  - @pyreon/core@0.34.0
  - @pyreon/runtime-server@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.32.0

### Patch Changes

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`d38bed4`](https://github.com/pyreon/pyreon/commit/d38bed4ce425f6fe804e56df84a0e80e6d22a198), [`a72f972`](https://github.com/pyreon/pyreon/commit/a72f972050edceda52888fa93b8c763a2c71b86a), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.30.0

### Minor Changes

- [#1365](https://github.com/pyreon/pyreon/pull/1365) [`a158aba`](https://github.com/pyreon/pyreon/commit/a158abac7a04f940a56608425ab63a4c8d72fb35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useHead({ script: [...] })` — non-blocking by default.

  Modern web-perf best practice (Lighthouse "Eliminate render-blocking resources" + Core Web Vitals): never emit a `<script src=...>` tag that blocks HTML parsing. Pyreon's `useHead` now adds `defer` to any script tag with `src` and no explicit load strategy.

  ```tsx
  // Before — render-blocking by default:
  useHead({ script: [{ src: "/analytics.js" }] });
  // → <script src="/analytics.js"></script>  (blocks parser!)

  // After — non-blocking by default:
  useHead({ script: [{ src: "/analytics.js" }] });
  // → <script src="/analytics.js" defer=""></script>
  ```

  **Author overrides ALWAYS win** — no surprises:

  | Author input                             | Result                                     | Rationale                                             |
  | ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
  | `{ src: '/x.js' }`                       | `<script src="/x.js" defer>`               | Default — non-blocking                                |
  | `{ src: '/x.js', async: '' }`            | `<script src="/x.js" async>`               | Preserved — author intent                             |
  | `{ src: '/x.js', defer: '' }`            | `<script src="/x.js" defer>`               | No duplicate added                                    |
  | `{ src: '/x.js', type: 'module' }`       | `<script src="/x.js" type="module">`       | Modules defer per HTML spec — no extra `defer` needed |
  | `{ src: '/imap.js', type: 'importmap' }` | `<script src="/imap.js" type="importmap">` | Importmaps MUST execute synchronously per spec        |
  | `{ children: 'console.log(1)' }`         | `<script>console.log(1)</script>`          | Inline scripts unchanged — synchronous by design      |
  | `useHead({ jsonLd: {...} })`             | `<script type="application/ld+json">...`   | JSON-LD has explicit type, unaffected                 |

  **Why this is safe**: the default only adds `defer` when ALL three signals are absent (no `type`, no `async`, no `defer`). The four cases where the framework should NOT auto-defer are all author-intentional inputs that opt out by their nature:

  1. **`type="module"`** — already deferred per HTML spec
  2. **`type="importmap"`** — must execute synchronously
  3. **`async`** — author explicitly chose parallel-load
  4. **`defer`** — already deferred (no-op)

  **Breaking change** for code that legitimately needs render-blocking script loads — vanishingly rare. The escape hatch: pass `type=""` (explicit empty string opts out of the default; the type attr serializes as empty), OR use `dangerouslySetInnerHTML` to write the raw tag.

  **7 specs** lock the contract:

  - External `src` defaults to `defer` (positive)
  - `async` preserved without adding `defer` (override)
  - `defer` preserved without duplication (idempotent)
  - `type="module"` preserved without `defer` (spec)
  - `type="importmap"` preserved without `defer` (spec)
  - Inline script (no `src`) not touched (semantic)
  - JSON-LD shorthand unaffected (semantic)

  **Bisect-verified**: replacing the noLoadStrategy detection with `false` fails the load-bearing positive spec; 6 negative-control specs continue to pass.

  23/23 verify-modes • 11/11 validate-fast • typecheck + lint clean.

  **Expected production impact**: every Pyreon app that uses `useHead({ script: [...] })` without explicit `defer`/`async` shifts from render-blocking to non-blocking script loads. Lighthouse's "Eliminate render-blocking resources" score is the primary signal that benefits.

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`4c9844d`](https://github.com/pyreon/pyreon/commit/4c9844d4a408549ad48e3d93bbf686ba946032da), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`d040055`](https://github.com/pyreon/pyreon/commit/d040055e793c3b3e68cd58a286327655aee7ab6e), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-server@0.33.0

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

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`9a863b7`](https://github.com/pyreon/pyreon/commit/9a863b71e946898ab2a8dac7051cef30adada7b4), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-server@0.33.0

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

- Updated dependencies []:
  - @pyreon/runtime-server@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-server@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-server@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-server@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-server@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-server@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-server@0.33.0

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
  - @pyreon/runtime-server@0.25.1

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
  - @pyreon/runtime-server@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/runtime-server@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/runtime-server@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/runtime-server@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/runtime-server@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/runtime-server@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/runtime-server@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-server@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#727](https://github.com/pyreon/pyreon/pull/727) [`1d825c2`](https://github.com/pyreon/pyreon/commit/1d825c2374a39833881c490887602354a7d590af) Thanks [@vitbokisch](https://github.com/vitbokisch)! - simplify: remove `HeadContext`-dedup workaround now that
  `@vitus-labs/tools-rolldown >= 2.4.0` shares chunks across sub-entries

  Root-bumped `@vitus-labs/tools-rolldown` from `^2.3.1` to `^2.4.0`. The
  upstream tool now emits a shared chunk for modules used by multiple
  sub-entries (`lib/_chunks/`), so `context.ts` is automatically hoisted
  into the single `lib/context.js` chunk — every other sub-entry's bundle
  imports `HeadContext` from it via relative-path `./context.js`,
  `createContext(null)` runs exactly once at runtime, and the SSG-meta-
  dropped bug is structurally impossible.

  Removes the per-package workarounds added in [#722](https://github.com/pyreon/pyreon/issues/722):

  - `packages/core/head/vl-tools.config.mjs` — deleted (no more
    `external: ['@pyreon/head/context']` rule needed)
  - source self-package imports reverted to relative `./context` in
    `index.ts` / `provider.ts` / `use-head.ts` / `ssr.ts` (+ removed the
    rationale comment blocks)
  - `vitest.shared.ts` `@pyreon/head/context` alias removed

  Kept (legitimate, not workarounds):

  - `./context` sub-export in `package.json` — public API surface; users
    can still `import { HeadContext } from '@pyreon/head/context'`
  - bundle-level regression test, **rewritten** to assert the new (and
    stronger) invariant: NO file under `lib/` (including `_chunks/*.js`)
    outside `lib/context.js` calls `createContext()`. Locks the bug class
    against any future regression (e.g. downgrade of the build tool).

  Verified empirically:

  - `lib/context.js : createContext = 2` (THE source of truth)
  - `lib/{index,provider,use-head,ssr}.js : createContext = 0` (each)
  - `lib/_chunks/use-head-*.js : createContext = 0`
  - regression test 6/6 pass on the rebuilt artifacts

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-server@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Minor Changes

- [#722](https://github.com/pyreon/pyreon/pull/722) [`33ce726`](https://github.com/pyreon/pyreon/commit/33ce726710d776abc563f7a0fed6a8ac93c9213d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(head): `HeadContext` is now one shared Symbol across all sub-entries — fixes `useHead()` tags silently missing from SSG output

  **Bug.** `@pyreon/head@0.21.0` shipped four sub-entries (`lib/index.js`, `lib/provider.js`, `lib/use-head.js`, `lib/ssr.js`) AND the shared `@vitus-labs/tools-rolldown` build invokes rolldown ONCE PER SUB-ENTRY (no cross-entry shared chunks). Result: every sub-bundle independently inlined `context.ts` and ran its own `createContext(null)` at module init — each call minted a unique `Symbol.for(...).id`, so a `useContext(HeadContext)` lookup in one bundle (the app's `useHead` from `lib/use-head.js`) silently MISSED a `provide(HeadContext)` from another (e.g. `renderWithHead` from `lib/ssr.js`).

  **Real-world symptom (reported):** after bumping to `@pyreon/*@0.21.0`, every `<Meta>`-emitted tag (title, og:_, twitter:_, JSON-LD, robots, canonical) silently vanished from SSG'd HTML on every prerendered page (`dist/index.html`, `dist/resume/index.html`, `dist/404.html`). The styler `<style>` tag from the same `renderWithHead` pipeline still made it through, the baked-in template's static meta still made it through — only `useHead`-registered tags were dropped. Dev was fine because Vite's `bun` condition resolves to a single shared `src/context.ts` (ESM single-evaluation guarantee); the bug only fires against the built `lib/` artifacts.

  **Why dev / source-mode tests didn't catch it:** every existing test ran under the `bun` condition where ESM gives us one `HeadContext` for free. The bug is structurally invisible until you load `lib/*.js`. The new `tests/context-identity.test.ts` is the bundle-level gate that locks the contract going forward — see below.

  **Fix.** Three coordinated changes:

  1. **New `./context` sub-export in `package.json`** — gives `HeadContext` a stable runtime address (`lib/context.js`) every sub-bundle can resolve to.

  2. **New `vl-tools.config.mjs`** with `build.external: ['@pyreon/head/context']` — tells rolldown to NOT inline the specifier in any sub-entry's bundle; emit `import { HeadContext } from "@pyreon/head/context"` verbatim instead. At runtime, every importer (every `lib/*.js`) resolves to the same `lib/context.js` module instance → one Symbol → cross-bundle `useContext` lookups work.

  3. **Source change — runtime VALUE imports of `HeadContext` / `createHeadContext` now go through the self-package path** `'@pyreon/head/context'` (in `index.ts`, `provider.ts`, `use-head.ts`, `ssr.ts`). Type-only imports keep relative `./context` paths — types erase at build, externalization doesn't apply.

  Companion vitest alias in `vitest.shared.ts` so the self-package import resolves to `src/context.ts` under the `bun` condition during dev / test (same pattern as the other 14 sub-path aliases there).

  **Coverage.** New `tests/context-identity.test.ts` — 11 structural assertions on the built `lib/`:

  - `lib/context.js` is the SINGLE bundle that calls `createContext()` (the source of truth for the Symbol)
  - `lib/index.js`, `lib/provider.js`, `lib/use-head.js`, `lib/ssr.js` each have ZERO `createContext` references (it.each, 4 specs)
  - All 4 non-context sub-bundles emit `from "@pyreon/head/context"` external imports (it.each, 4 specs)
  - `package.json` declares the `./context` sub-export with the right wiring
  - `vl-tools.config.mjs` externalizes `@pyreon/head/context`

  **Bisect-verified.** Reverting `vl-tools.config.mjs` to empty `external: []` and rebuilding fails 8 of the 11 specs with the exact bug-shape errors (`expected 2 to be +0` — each sub-bundle gets its own `createContext` calls again; `expected false to be true` — no external import). Restored → 6 files / 123 vitest tests + typecheck clean; `@pyreon/server` downstream tests (142/142) unaffected.

  **No breaking change** — `./context` is a new sub-export; existing `./`, `./provider`, `./use-head`, `./ssr` paths keep working with identical public APIs. The fix is purely internal bundle reorganization.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-server@0.22.0

## 0.21.0

### Patch Changes

- [#715](https://github.com/pyreon/pyreon/pull/715) [`2b39231`](https://github.com/pyreon/pyreon/commit/2b3923112e6b06b5fd2cd3a3daa1425e7a6f755c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(head): `HeadProvider` now inherits an outer `HeadContext` instead of silently shadowing it

  `HeadProvider`'s context resolution was `props.context ?? createHeadContext()` — it ALWAYS allocated a fresh ctx when no explicit prop was passed, even when an outer `HeadContext` was already in scope. That defeated the documented composition `renderWithHead(h(HeadProvider, null, h(App)))` AND, structurally, the entire `@pyreon/zero` SSG/SSR pipeline (whose `createApp` mounts `h(HeadProvider, null, …)` unconditionally). Every `useHead()` call in the subtree wrote tags into the inner ctx; `renderWithHead` resolved the outer ctx and produced an **empty `<head>` string**. Static SSG output shipped with no `<title>`/`<meta>`/JSON-LD/OG tags — social scrapers and non-JS crawlers saw nothing; client hydration eventually populated `document.head` so the bug stayed invisible to standard browser inspection.

  Fix:

  - Resolution order is now `props.context ?? useContext(HeadContext) ?? createHeadContext()` — explicit prop wins (documented SSR / opt-out-isolation pattern), otherwise the outer `HeadContext` in scope is inherited (the missing rule), otherwise a fresh ctx is auto-created (preserves CSR-root behavior).
  - Documented JSDoc + manifest summary + `docs/docs/head.md` "Context resolution" section + CLAUDE.md bug-class note.
  - `nativeCompat(HeadProvider)` unchanged — compat-mode marker still relevant.

  Backward compatibility:

  - Apps that always passed `context={someCtx}` explicitly are unaffected (explicit prop still wins).
  - Apps that mounted ONE root `<HeadProvider>` are unaffected (no outer ctx → fresh ctx auto-create path).
  - Apps that nested `<HeadProvider>` and **relied on the inner one being isolated** now share the outer registry by default; that was almost always the unintended pre-fix behavior (the inner shadowed and the outer's lookup returned empty). Apps that genuinely need isolation pass `context={createHeadContext()}` explicitly.

  Regression test `packages/core/head/src/tests/provider-inherits-context.test.tsx` (5 specs): the zero-shape `renderWithHead(h(HeadProvider, null, h(App)))` renders with `useHead()`-registered tags in `head`; nested `<HeadProvider>` inherits outer ctx without shadowing; explicit `context` prop still wins for isolation; CSR root with no outer ctx still auto-creates a fresh one. Bisect-verified: reverting `useContext(HeadContext) ??` → 2/5 fail with `expected '' to contain '<title>Page Title</title>'` (zero-shape) and `expected '<title>Outer Title</title>' to contain 'name="inner"'` (nested-shadow). Restored → 5/5 pass.

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-server@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/runtime-server@0.20.0

## 0.19.0

### Minor Changes

- [#643](https://github.com/pyreon/pyreon/pull/643) [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useHead({ speculationRules })` — declarative Speculation Rules support (E12).

  **Origin: the Qwik architecture analysis.** A deep Pyreon-vs-Qwik review concluded the famous "resumability / zero-JS-for-free" thesis was already measured-and-shelved here (the Tier-2 spike: ~28% ceiling, depth-invariant, demo-vs-prod 38× variance — see `SPIKE.md` on `spike/tier2-resumability`). Decomposing Qwik into its separable ideas, **exactly one** cleared the "worth implementing" bar: native speculative loading (Q4) — and `@pyreon/head` already emits `<script>` tags with a body, so it collapses to a thin, idiomatic helper that mirrors the existing `jsonLd` convenience line-for-line. The resumability spike itself was NOT re-run (it would contradict its own measured verdict); the dead bytes thesis was NOT touched.

  **What this adds.** A new opt-in `speculationRules?: SpeculationRules` field on `UseHeadInput` (plus exported `SpeculationRules` / `SpeculationRule` / `SpeculationEagerness` types). It auto-wraps the object as a single `<script type="speculationrules">` tag — supported browsers prefetch or fully prerender the next document(s) for near-instant navigation; unsupported browsers ignore it (no polyfill). Both `source: 'list'` (explicit URLs) and `source: 'document'` (CSS-selector predicate — the Qwik "prefetch by intent" shape) are typed. **Zero runtime JS, opt-in (nothing emitted unless called), SSR + client for free** (rides the existing head pipeline, including its `</script>`-breakout escaper), deduplicated by a single key. No default behavior change.

  **Run as a bounded spike with kill-criteria fixed first** (the codebase's own Tier-2 methodology), shipped only because both load-bearing criteria passed:

  1. **Correctness & SSR-safety — ✅ 0 defects.** 7 unit specs: SSR single-block emission + valid-JSON round-trip, CSR `document.head` sync, key dedup (innermost wins, never two blocks), reactive regen on signal change, `document`-source predicate round-trip, opt-in absence, and XSS-safety (`/x</script><b>pwn` URL → escaped, JSON still parses back to the original).
  2. **Real-Chromium browser acceptance — ✅.** A `*.browser.test.tsx` spec asserts in real Chromium: the script lands in `<head>`, `HTMLScriptElement.type === 'speculationrules'`, the body is valid JSON that round-trips, and Chromium raises **zero** speculation-rules parse errors. (Whether Chromium then prefetches/prerenders is browser-discretionary + headless-flag-dependent and is **intentionally not asserted** — the framework's contract is "emit a correct, valid declarative hint", same as `<link rel=prefetch>`. The docs + manifest mistakes state this explicitly; no measured-TTI claim is made.)
  3. **Net value over existing prefetch — qualitatively yes, honestly framed.** `RouterLink prefetch=intent` warms loader _data_ for in-app client-side nav; Speculation Rules warm the _document_ at the platform level for full navigations — a strictly additional, complementary capability the framework didn't expose. Not overclaimed as a guaranteed perf win.

  **Validation.** `@pyreon/head`: 107 unit + 10 real-Chromium browser tests pass (+7/+1 new). Typecheck clean (head + mcp). `bun run lint` 0 errors. `gen-docs --check` in sync (manifest feature + mistakes added; `api-reference.ts` head region regenerated → the `@pyreon/mcp` patch). `@pyreon/mcp` 497 tests pass. Docs surfaces updated in-PR: `manifest.ts`, `docs/docs/head.md` (intro + `UseHeadInput` interface + a new `## Speculation Rules` section with the honest hint-not-guarantee framing), `index.ts` type exports. No new anti-pattern or lint rule discovered (the hint-not-guarantee caveat is documented as a manifest `mistakes[]` entry).

  No bug fixed → the bisect-verify mandate (revert fix → assert failure) does not apply; this is a new additive capability, stated plainly rather than fabricating a regression.

### Patch Changes

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

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-server@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/runtime-server@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-server@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-server@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-server@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-server@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-server@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-server@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-server@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-server@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-server@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-server@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-server@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/runtime-server@0.7.0

## 0.6.0

### Patch Changes

- feat(core): add `provide()` helper, widen `ComponentFn` return to `VNodeChild`, add `ExtractProps` and `HigherOrderComponent` utility types

  Migrate router, head, preact-compat to use `provide()` instead of manual `pushContext`/`popContext`

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/runtime-server@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-server@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-server@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-server@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-server@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-server@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-server@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
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
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-server@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-server@0.3.1

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
  - @pyreon/runtime-server@0.3.0

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
  - @pyreon/runtime-server@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-server@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-server@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/runtime-server@0.1.1
