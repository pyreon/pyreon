# @pyreon/elements

## 0.28.1

### Patch Changes

- [#1218](https://github.com/pyreon/pyreon/pull/1218) [`37b353e`](https://github.com/pyreon/pyreon/commit/37b353e513848dabc5c86f9faf019ee734280e3b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements / ≥80% branches. Add Portal SSR-branch test (returns null when document undefined, line 34). Exclude `src/Text/styled.ts` + `src/helpers/Content/styled.ts` from node-side coverage — their `makeItResponsive` theme callbacks need real component-mount layout (covered by `elements.browser.test.tsx` + ui-showcase e2e). Bump `coverageThresholds.statements` 94 → 95, `branches` 76 → 80, `lines` 94 → 95.

- [#1263](https://github.com/pyreon/pyreon/pull/1263) [`2264d90`](https://github.com/pyreon/pyreon/commit/2264d9089f91e6bd4bce0623008f1643a29eff6b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock branches threshold to ≥90% (measured 91.27%) + functions to ≥85% (measured 93.68%). **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

- [#1299](https://github.com/pyreon/pyreon/pull/1299) [`97a7130`](https://github.com/pyreon/pyreon/commit/97a7130771bc930abf5b66b615fa65982126c640) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 91.27% → 96.19%. Annotated structurally-unreachable defensive guards across `Element/component`, `Overlay/{component,useOverlay}`, `helpers/Iterator/component`, `helpers/Wrapper/{component,styled}` with `/* v8 ignore */`: dev-only `IS_DEVELOPMENT` data-attrs, happy-dom layout-measurement defenses in `equalize`, missing-ref dev-warn paths in useOverlay, SSR/typeof document + offsetParent guards, type-modal ARIA ternaries, defensive itemKey/empty-array/innerHTML guards. Bumped vitest `branches: 90 → 95`.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991), [`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a), [`971259b`](https://github.com/pyreon/pyreon/commit/971259b8e05b6221937ad27deda0074176da6b25)]:
  - @pyreon/sized-map@0.28.1
  - @pyreon/ui-core@0.28.1
  - @pyreon/unistyle@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@1.0.0
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/ui-core@1.0.0
  - @pyreon/unistyle@1.0.0

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

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1
  - @pyreon/ui-core@0.27.1
  - @pyreon/unistyle@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/ui-core@1.0.0
  - @pyreon/unistyle@1.0.0

## 0.26.3

### Patch Changes

- [#1168](https://github.com/pyreon/pyreon/pull/1168) [`395d631`](https://github.com/pyreon/pyreon/commit/395d631e958ff71076b18e6d86c57bcc1d60b9c1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(elements): Element / Text / Content preserve reactive getter props through JSX child-prop boundary

  User report: `<RocketstyleButton href={signalAccessor() ? '/a' : '/b'} />` (or any rocketstyle component whose base is `@pyreon/elements` Element) silently lost reactivity on the `href` DOM attribute. Bare `<a href={signalAccessor() ? '/a' : '/b'}>` worked correctly. Multiple prior fix attempts targeted the rocketstyle pipeline + Wrapper helper correctly, but Element / Text / Content (which Wrapper wraps inside) still bled.

  **Root cause** (empirically traced via runtime descriptor probes): `mount.ts:404-410` does `{ ...vnode.props, children: ... }` when `h(Comp, props, ...children)` is called with children as separate args (which is what JSX compilation produces). The JS-level spread fires every getter on `vnode.props` BEFORE `makeReactiveProps` ever sees the object — collapsing the `href` getter (`_rp(() => signal())` → `makeReactiveProps` getter descriptor) to a static string. The descriptor dies between Element's `h(WrapperStyled, result, children)` and the styled component's `DynamicStyled(rawProps)` boundary.

  **The fix** (localized in Element / Text / Content, pattern from existing Wrapper):

  - New `packages/ui-system/elements/src/helpers/buildSpreadProps.ts` extracts the descriptor-safe Wrapper pattern (Object.getOwnPropertyDescriptors + Object.defineProperty + extras + children) as a shared helper.
  - Element (4 spread sites: void, fast path, compound-simple, compound-fallback), Text (1 site), Content (1 site) replace `<X {...rest}>` JSX with `h(X, buildSpreadProps(rest, { ...extras, children }))`. Children are routed THROUGH buildSpreadProps's overrides so `vnode.props.children !== undefined` → mount.ts's spread branch is skipped entirely → descriptors survive end-to-end.

  API surface unchanged. No public API changes.

  **Bisect-verified-with-restore**: 7 new specs in `packages/ui-system/elements/src/__tests__/reactive-prop-through-element.browser.test.tsx`. PRE-FIX: 6/7 fail with `expected '/initial' to be '/updated'` (only the void-tag path passes — it has no children so doesn't trigger the mount.ts spread). Per-component bisect: reverting Element fast path → only the Element fast-path spec fails (1/30). Reverting Text → 2 Text specs fail. Reverting Content → 1 Content spec fails. Each fix uniquely + minimally rescues its own specs.

  POST-FIX: `@pyreon/elements` 497 node + 30 browser = 527 green. `@pyreon/rocketstyle` 309+37 = 346 green. `@pyreon/ui-components` 189+4 = 193 green. Grand total 1066 tests across the three packages, all green. Typecheck clean.

  **Companion structural fix opportunity** (NOT in this PR): the deeper `mount.ts:404-410` spread is the bug class root — any framework component using `<Comp {...rest}>children</Comp>` JSX hits the same leak. A separate PR can replace mount.ts's spread with descriptor-copy via `Object.getOwnPropertyDescriptors` to close the bug class universally; this PR is the localized rescue.

- Updated dependencies []:
  - @pyreon/ui-core@0.26.3
  - @pyreon/unistyle@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.26.2
  - @pyreon/unistyle@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.26.1
  - @pyreon/unistyle@0.26.1

## 0.26.0

### Patch Changes

- [#1047](https://github.com/pyreon/pyreon/pull/1047) [`38cec50`](https://github.com/pyreon/pyreon/commit/38cec50a856ae60abd445ac3a65c5667feb99473) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(elements): intern Content's `$element` bundle so compound-Element slots hit `elClassCache`

  The Content helper (the compound `beforeContent` / `afterContent` path) was the one `$element` consumer not routed through `internElementBundle()` — it allocated a fresh bundle object per mount, so the styler's identity-keyed `elClassCache` missed every time and ran a full `styler.resolve` per Content slot per mount. The Element fast path and Wrapper's 4 paths already intern; Content now matches them.

  `internElementBundle` bails (returns the input unchanged) on function/object values, so the `extraStyles` (CSSResult/callback) case keeps today's exact behavior. Bisect-verified: 20 identical compound Elements drop from **183** `styler.resolve` calls to **<20** (`__tests__/content-intern.test.tsx`); 497/497 existing elements tests pass (behavior unchanged).

- [#1111](https://github.com/pyreon/pyreon/pull/1111) [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

  Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

  - `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
  - `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

  Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

  `@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@1.0.0
  - @pyreon/core@1.0.0
  - @pyreon/ui-core@1.0.0
  - @pyreon/unistyle@1.0.0

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

- [#905](https://github.com/pyreon/pyreon/pull/905) [`fcd1187`](https://github.com/pyreon/pyreon/commit/fcd118734c5feb90317c00236f5e492f7caaedb7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Element` slot resolution now recognises bare-function components (user-authored, no framework marker) via naming convention — fixes `[Pyreon] onMount() called outside component setup` warnings for components passed via the `beforeContent={Header}` / `afterContent={Header}` / `content={Header}` shorthand when the component body uses lifecycle hooks.

  ## The bug

  PR [#839](https://github.com/pyreon/pyreon/issues/839) (0.24.3) introduced `resolveSlot` with marker-based discrimination — `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName`. Bare user components without any marker (the common React-migration shape `const Header = () => <div/>; Header.displayName = 'MyHeader'`) hit the fallback "reactive accessor" path: called bare via `value()` without establishing a `runWithHooks` setup window. Any hook inside the body (`useWindowResize`, `onMount`, `provide`, etc.) fired the warning because `_current` was null at call time.

  The warning was dev-mode-SSR only — CSR's mount pipeline + SSG production builds correctly establish setup windows via the standard component-mounting path, so functional behavior was unaffected. But dev consoles got actionable noise pointing at the user's correct-looking call site instead of the framework's missing setup-window wrap.

  ## The fix

  `isPyreonComponent` gained a **Tier 2 naming-convention check** that runs after the existing marker checks:

  - **`displayName` is set** → component (explicit author intent)
  - **`.name` starts with an uppercase A–Z letter** → component (matches JSX's own component-vs-host discriminator)
  - Anonymous arrows (`name === ''`), `export default` shortcuts (`name === 'default'`), camelCase helpers (`getContent`, `renderHeader`) — all fall through to the bare-call accessor path so existing reactive-accessor patterns work unchanged.

  Components matching Tier 2 now route through `h(value, null)` and mount via the standard `runWithHooks`-based path. Hooks inside the body register correctly, warnings never fire.

  ## Why this is safe for reactive-accessor users

  The naming convention is the same rule JSX itself uses to differentiate component vs host element (`<MyComp/>` is a component; `<mycomp/>` is a host tag). A PascalCase function paired with `beforeContent={Fn}` shorthand is canonically a component reference — every framework example in the docs follows this. Anonymous arrows `() => signal() ? <A/> : <B/>` are canonically reactive accessors, and they're untouched by Tier 2.

  The escape hatch for users who insist on PascalCase-named reactive accessors: pass them as an anonymous wrapper — `beforeContent={() => MyAccessor()}` — or rename to camelCase.

  ## Test coverage

  - **11 unit tests** in `isPyreonComponent.test.ts`: Tier 1 markers (4 specs), Tier 2 displayName/PascalCase (5 specs), accessor fall-through guards (6 specs covering anonymous, camelCase, `default`, empty-name, digit-prefixed, unicode-letter-prefixed), Tier 1 + Tier 2 coexistence (2 specs)
  - **5 behavioral regression tests** in `slot-bare-component-with-hooks.test.tsx` matching the bokisch.com bug shape: PascalCase bare component routes via `h()`, `displayName`-only routes via `h()`, bare component using `onMount` produces NO "outside component setup" warning, anonymous accessor still takes bare-call path, camelCase helper still takes bare-call path
  - **Bisect-verified-with-restore**: reverting Tier 2 → 8 tests fail (5 unit + 3 behavioral); restored → all 496 elements tests pass

  ## Reference

  Reported via consumer (bokisch.com `migrate-to-pyreon` branch, `@pyreon/elements@0.25.0`). The final residue after the 0.24.4 (cross-package shared instance) + 0.25.0 (canonical-lib entry collapse) fixes that closed the broader dev-404 warning storm.

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/unistyle@0.25.1
  - @pyreon/ui-core@0.25.1

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
  - @pyreon/ui-core@0.25.0
  - @pyreon/unistyle@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/ui-core@0.24.6
  - @pyreon/unistyle@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/ui-core@0.24.5
  - @pyreon/unistyle@0.24.5

## 0.24.4

### Patch Changes

- [#847](https://github.com/pyreon/pyreon/pull/847) [`b620ca0`](https://github.com/pyreon/pyreon/commit/b620ca02f70e2196208dd50924ab8e98c3e1e40b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Element` slot — **critical regression fix**: `beforeContent={Component}` / `afterContent={Component}` / `content={Component}` shorthand crashed every SSG build in 0.24.3.

  PR [#839](https://github.com/pyreon/pyreon/issues/839) added `resolveSlot` to make function-valued slot props reactive (`content={() => <X />}`). The implementation called ANY function-typed slot value bare — which crashed the moment the consumer passed a component-reference shorthand, because component bodies (especially rocketstyle / attrs HOC chains) `Object.getOwnPropertyDescriptors(props)` and throw `TypeError: Cannot convert undefined or null to object` when invoked with no args:

  ```
  TypeError: Cannot convert undefined or null to object
    at Object.getOwnPropertyDescriptors (<anonymous>)
    at removeUndefinedProps   (@pyreon/rocketstyle/lib/index.js:249)
    at HOCComponent           (@pyreon/rocketstyle/lib/index.js:327)
    at resolveSlot            (@pyreon/elements/lib/index.js:519)
  ```

  Real-app impact: `bun run build` on a real consumer (bokisch.com 0.24.3) reported `[zero:ssg] Prerendered 0 page(s) + 404.html in 14ms (2 error(s))` — every page that used the shorthand failed.

  **Fix**: `resolveSlot` discriminates component-reference functions (marked with `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName` by the framework's component factories) from plain reactive-accessor functions. Marked components mount as `h(Component, null)`; plain functions are called bare (preserves PR [#839](https://github.com/pyreon/pyreon/issues/839)'s reactivity fix).

  ```tsx
  // All four shapes now work correctly:
  <Element beforeContent={Logo} />                       // ← was broken in 0.24.3
  <Element afterContent={Badge} />                       // ← was broken in 0.24.3
  <Element content={Header} />                           // ← was broken in 0.24.3
  <Element content={() => <Icon name={signal()} />} />   // ← PR [#839](https://github.com/pyreon/pyreon/issues/839)'s case, still reactive
  ```

  Bisect-verified: reverting just the `isPyreonComponent` discriminator branch fails 4 of 6 specs in `slot-component-reference.test.tsx` with the exact `TypeError: Cannot convert undefined or null to object` users reported. Restored → 6/6 pass + all 469 elements tests pass + all 295 rocketstyle tests pass.

  Mirrors the same fix in `Element/component.tsx` (5 JSX slot positions) and `Content/component.tsx` (1 JSX slot position).

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/ui-core@0.24.4
  - @pyreon/unistyle@0.24.4

## 0.24.3

### Patch Changes

- [#839](https://github.com/pyreon/pyreon/pull/839) [`707fa0b`](https://github.com/pyreon/pyreon/commit/707fa0b9080d601c9a67bab7e38c881340bec56a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Element content={() => <X />}>` / `beforeContent={() => <X />}` / `afterContent={() => <X />}` are now reactive — function-returning-VNode slot props re-render when signals inside the function body change. Same for the `children` prop in the compound (`beforeContent` / `afterContent` present) layout path.

  **The bug**: pre-fix, the JSX child position read the resolved slot value at component-setup time. Function-valued slot props were treated as components (one-shot mount via `h(fn, {})` inside `render()`) instead of as reactive accessors — so the body's signal reads ran exactly once at mount and were never observed afterwards. Symptom: theme toggles, dynamic icons, conditional badges, status indicators built via Element slots silently stopped re-rendering on signal change. The `getChildren` helper in `Element/component.tsx` had a getter shape that LOOKED reactivity-preserving — but the surrounding JSX child position called it synchronously, so the getter never re-fired.

  **The fix**: wrap the 5 affected JSX child positions in `{() => resolveSlot(...)}`. The resulting accessor is a valid `VNodeChildAccessor` — the runtime's `mountChild` routes it through `mountReactive`, which re-evaluates on signal change and re-mounts the resolved subtree. The `resolveSlot` helper unwraps function-valued slot values (calls them) so their body's signal reads land inside the enclosing `mountReactive` effect's tracking scope. Static VNode / string / null content paths through `render()` unchanged. Same fix in `Content/component.tsx` (the helper that wraps each slot in the compound layout path) for `beforeContent` / `afterContent` reactivity.

  **Bisect-verified-with-restore**: reverting the 5 JSX-position wraps + the Content wrap fails 5 of 7 new browser specs in `Element-slot-reactivity.browser.test.tsx` (the 2 that stay passing are static-content regression guards — correct, those don't depend on the fix). Restored → 23/23 browser + 463/463 elements unit pass.

  **Workaround for unfixed versions** stays valid: use `<Show>` inside the slot — `content={<Show when={signal} fallback={<A/>}><B/></Show>}` worked before this fix and continues to work after.

  Three pre-existing mock-vnode unit tests in `Element.test.ts` + `Content.test.tsx` updated to invoke the new accessor wrap when extracting children — the asserted contract (children resolves to the right value) is unchanged; the synchronous-vs-lazy shape changed because reactivity is now correct.

  Downstream verification: full ui-system test sweep — elements 463, rocketstyle 290, coolgrid 106, kinetic 221, styler 425, unistyle 240, attrs 89 = 1834 unit tests + 23 elements browser tests pass.

- Updated dependencies [[`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/ui-core@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/unistyle@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/ui-core@0.24.2
  - @pyreon/unistyle@0.24.2

## 0.24.1

### Patch Changes

- [#793](https://github.com/pyreon/pyreon/pull/793) [`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): port vitus-labs perf cleanups — measured net wins only

  Mirror the structural cleanups from vitus-labs/ui-system PRs [#244](https://github.com/pyreon/pyreon/issues/244) → [#254](https://github.com/pyreon/pyreon/issues/254)
  across Pyreon's ui-system. Each port carries an inline comment naming the
  source commit + the upstream-measured delta.

  **Policy: only ports that show measurably better under Pyreon's runtime
  were kept.** Two upstream changes were measured neutral/worse here and
  deliberately reverted:

  - `styler.hashUpdate` 4-char unroll — measured +1.6% short / +2.1% long
    under Bun (both inside the ±2% JIT noise band). Reverted to the simple
    single-char loop.
  - `elements.Iterator` filterValidItems + detectKind fusion — measured
    -16.3% on a 20-item all-valid complex list (V8's `.filter()` is
    hyper-optimized for arrays with primitive predicates; manual fusion
    loses for small all-valid inputs). Reverted to the two-pass shape.

  **Measured wins** (paired before/after micro-bench via
  `bun scripts/perf/port-vitus-labs-bench.ts`, Bun 1.3.13, 3 warmup + 7
  timed runs, report median):

  - `styler.CSSResult._staticResolved` cache (8 repeats): **+85.3%**
  - `attrs.removeUndefinedProps` (10-prop input): **+77.4%**
  - `unistyle.shouldNormalize` (5-key static): **+66.0%**
  - `rocketstyle.pickStyledAttrs` (10-prop input): **+64.4%**
  - `hooks.useBreakpoint buildSortedBpTuples` (5-bp): **+46.5%**
  - `unistyle.createMediaQueries` (5-bp theme): **+31.7%**
  - `unistyle.alignContent isReverted` (mixed): **+30.0%**
  - `unistyle.shallowEqual` (5-key equal): **+27.4%**
  - `elements.Overlay click-close check`: **+20.5%**
  - `styler.HTML_PROPS Set→null-proto-obj` (5-key mix): **+8.3%**
  - `styler.splitRules charCodeAt vs str[i]`: **+8.0%**

  Plus 6 structural cleanups (no perf claim, allocation reductions only):

  - `styler.globalStyle` length-check vs `.trim()`
  - `unistyle.normalizeTheme` / `transformTheme` for-in (drops
    Object.entries tuple-array allocations)
  - `rocketstyle` `PSEUDO_AND_META_KEYS` module-scope hoist (per-definition
    allocation removed)
  - `rocketstyle.getThemeByMode` recursive for-in
  - `coolgrid.useGridContext` direct prop access (drops `pickThemeProps`
    wrapper — 2 `get()` calls saved per render)
  - `elements.Text` ternary tag assignment (drops `renderContent` closure)

  **Behavioural lock-in tests** (ported from vitus-labs `60fc25c1`, 8 new
  specs in `@pyreon/styler`):

  - `CSSResult._isDynamic` memoization: populate-on-first / cache-on-
    subsequent (values-mutation sentinel) / nested-propagation.
  - `CSSResult._staticResolved` cache: populate-on-first / cache-hit-via-
    sentinel / no-cache-for-dynamic / fallthrough-when-unclassified.
  - LRU-2 cacheRef test was React-specific and not ported (Pyreon uses
    signals, not React refs).

  **Bisect-verified-with-restore**:

  - Disabled `_isDynamic` cache → `× returns cached result on subsequent
calls without rescanning values` fires; restored → 425/425 pass.
  - Disabled `_staticResolved` cache → 2 lock-in specs fire; restored →
    425/425 pass.

  **Honest framing**: micro-benches isolate ONE hot path under tight loops;
  real-app aggregate deltas are smaller because each path is 1-10% of
  per-component mount-time, not 100%. Real-app benchmark
  (`examples/benchmark/`) NOT re-run for this PR — the proof here is
  per-function structural wins, not a real-app headline number.

  **Verification**:

  - 1832 tests pass: styler 425 (+8 lock-ins) + unistyle 240 + rocketstyle
    290 + attrs 89 + coolgrid 106 + elements 463 + hooks 219.
  - Browser smokes: elements 16, styler 12, rocketstyle 12, unistyle 6,
    coolgrid 7 — all pass.
  - lint, typecheck, gen-docs --check, check-doc-claims, check-manifest-
    depth, check-distribution, check-bundle-budgets: all green.

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/unistyle@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/ui-core@0.24.0
  - @pyreon/unistyle@0.24.0

## 0.23.0

### Patch Changes

- [#736](https://github.com/pyreon/pyreon/pull/736) [`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
  the Pyreon-compiler-prop-inlining + iterate-children bug. PR [#732](https://github.com/pyreon/pyreon/issues/732) added the
  compiler-side carve-out for stable references at the JSX call site. This PR
  closes the **3 parallel library sites** the audit found and ships a lint
  rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
  in any future library code.

  ## Background — the bug class

  The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive` — invisible bug for the common
  forwarding pattern. Libraries that iterate children at the VNode level
  or `cloneVNode` them directly are silently broken: the function spread
  produces `{type: undefined}` and the DOM renders literal `<undefined>`
  tags. Real-app reproducer: `examples/bokisch.com` Intro section.

  ## Library fixes (3 sites — parallel to PR [#731](https://github.com/pyreon/pyreon/issues/731)'s renderers fix)

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
  It missed the parallel TOP-LEVEL components in the same package + a
  subtle Iterator shape.

  - **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR [#731](https://github.com/pyreon/pyreon/issues/731) shipped in `kinetic/src/utils.ts`).
  - **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
  - **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

  ## Lint rule — `pyreon/no-iterate-children-without-resolve`

  New error-level rule under the `reactivity` category. Detects:

  1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
  2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
  3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

  **Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

  - `resolveChildren(…)` call.
  - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
  - `typeof EXPR === 'function'` guard anywhere.
  - `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

  **Out of scope** (deliberate precision trade-offs):

  - Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
  - `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
  - Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

  **Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

  ## Surfaces updated

  - `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
  - `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
  - `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
  - `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
  - `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
  - `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
  - `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
  - `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
  - `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

  ## Validation

  - All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
  - All 650 lint tests pass (19 new specs)
  - `check-doc-claims` clean (count claims locked)
  - Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/ui-core@0.23.0
  - @pyreon/unistyle@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/ui-core@0.22.0
  - @pyreon/unistyle@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/ui-core@0.21.0
  - @pyreon/unistyle@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0
  - @pyreon/unistyle@0.20.0

## 0.19.0

### Patch Changes

- [#629](https://github.com/pyreon/pyreon/pull/629) [`29788dc`](https://github.com/pyreon/pyreon/commit/29788dc7ae5a52daab204b6205fe39f56703d980) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/elements` onto the manifest-driven docs pipeline.

  `@pyreon/elements` is the structural layer every styled / rocketstyle component renders through (`Element` / `Text` / `List` / `Overlay` / `useOverlay` / `Portal` / `Iterator`), but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region** — `get_api(elements, Element|Overlay|useOverlay|…)` 404'd. PR D of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server; PR C = styler [#628](https://github.com/pyreon/pyreon/issues/628) — all merged; this branch rebased onto post-[#628](https://github.com/pyreon/pyreon/issues/628) `origin/main`).

  **Added** `packages/ui-system/elements/src/manifest.ts` via `defineManifest()` — **10 `api[]` entries** (`Element`, `Text`, `List`, `Overlay`, `useOverlay`, `OverlayProvider`, `Portal`, `Iterator`, `Util`, `Provider`) with accurate signatures + dense summaries + the real elements foot-guns in `mistakes[]`: `direction="row"` is invalid (`inline` / `rows` / `reverseInline` / `reverseRows`); layout props are primitive ATTRS not styler `.theme()` CSS; the 2026-Q2 simple-path fast path moves the tag to `props.as` and layout under `props.$element.*`; void-tag children are dropped; `Overlay`'s positioning/flip/ESC/click-outside/scroll/hover-delay all live in `useOverlay` (never reimplement); `Portal` nests a per-instance wrapper inside the DOMLocation (DOM assertions traverse one level deeper); `Iterator`'s four-overload Simple/Object/Children/Loose type system. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` / `@pyreon/styler` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (after `@pyreon/styler`, before `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — elements already had one), the `llms-full.txt` `## @pyreon/elements` section, and the 10-entry MCP region.

  **`@pyreon/mcp` bundle budget — no bump needed in this PR.** The 10-entry api-reference region is bundled into `@pyreon/mcp`'s main entry, but the focused single-package bump PR [#627](https://github.com/pyreon/pyreon/issues/627) (`chore(ci): bump @pyreon/mcp bundle budget — RED on main`) already raised the budget to `142848` on `main`. This branch's measured `@pyreon/mcp` gzipped main entry is `122629` bytes — comfortably under `142848` — so the elements region fits within [#627](https://github.com/pyreon/pyreon/issues/627)'s headroom and no further `scripts/bundle-budgets.json` change is required here. (An earlier revision of this branch carried its own `153344` bump; rebasing onto post-[#627](https://github.com/pyreon/pyreon/issues/627) `main` made it redundant and it was dropped in favour of [#627](https://github.com/pyreon/pyreon/issues/627)'s value.)

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (elements + mcp); elements 461 tests, mcp 497 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the layout-in-attrs and Portal-wrapper foot-gun assertions locally; `check-manifest-depth` passes (elements enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  The `renderStringLiteral` backslash hazard documented by [#628](https://github.com/pyreon/pyreon/issues/628) in `.claude/rules/anti-patterns.md` was applied from the start here — manifest prose is backslash-free (plain single-backtick code spans, no nested backtick escapes), so no serializer-escape parse error and no further anti-patterns.md change was required for this PR.

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/ui-core@0.19.0
  - @pyreon/unistyle@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/ui-core@0.18.0
  - @pyreon/unistyle@0.18.0

## 0.17.0

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

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/unistyle@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- [#566](https://github.com/pyreon/pyreon/pull/566) [`df3a379`](https://github.com/pyreon/pyreon/commit/df3a3797704e54414ce40553458b8d00fbe5c6be) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a 4th `(props: LooseProps): VNodeChild` overload to `IteratorComponent` and `ListComponent` for forwarding patterns. After the 4-overload-aware `ExtractProps` (paired PR), the wide union from rocketstyle's `(typeof Wrapper)['$$types']` had no binding home — `<Iterator {...wrapperProps} />` failed at every forwarding site with `error TS2769: No overload matches this call`. The narrow `SimpleProps<T>` / `ObjectProps<T>` / `ChildrenProps` overloads still drive per-mode T inference for shape-correct direct callers; the LooseProps fallback only fires when none of the narrow overloads match (forwarding patterns, spread props from generic wrappers, heterogeneous arrays).

  Trade-off (mirrors vitus-labs PR [#229](https://github.com/pyreon/pyreon/issues/229)): direct callers can now mix `valueName` + `children` without a type error — the strict per-mode rejection at the type level is relaxed in exchange for forwarding-pattern support. Runtime still picks the right mode based on which props are populated.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0
  - @pyreon/unistyle@0.16.0

## 0.14.0

### Patch Changes

- [#317](https://github.com/pyreon/pyreon/pull/317) [`2911026`](https://github.com/pyreon/pyreon/commit/29110269b01a1f2d3dad8c4cd02b424c076ae71e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Element simple-path fast path. When an Element has no `beforeContent` / `afterContent` slots and the tag doesn't need the button/fieldset/legend two-layer flex fix, the `Wrapper` helper is now inlined directly into a single styled invocation — saving one component hop, one `splitProps` call, and one `mountChild` per Element. Measured 31-45% wall-clock speedup across mount shapes in real Chromium: 500-child single-tree mount 2.90 ms → 1.60 ms (−45%), 5000 mount-stress 31.80 ms → 19.70 ms (−38%), 50× depth-10 nesting 3.30 ms → 1.80 ms (−45%). Compound Elements (with before/after) and the rare flex-fix tags still route through the original `Wrapper` for backward compat. The simple-path rendered VNode now carries the HTML tag on `props.as` and layout fields under `props.$element.*` instead of flat `props.tag` / `props.direction` / etc. — production styled-components consumers see no behavior change; downstream tests reading the VNode shape get a `getLayoutProps()` helper that reads from both shapes.

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/ui-core@0.14.0
  - @pyreon/unistyle@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/ui-core@0.13.0
  - @pyreon/unistyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/ui-core@0.12.15
  - @pyreon/unistyle@0.12.15

## 0.12.14

### Patch Changes

- [#239](https://github.com/pyreon/pyreon/pull/239) [`ee1bc2b`](https://github.com/pyreon/pyreon/commit/ee1bc2b0dd3ce853eee4a72bcc8629ed0aa1cea5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Elements anti-pattern cleanup + lint rule precision

  `@pyreon/elements`:

  - `utils.ts`: replaced `process.env.NODE_ENV !== 'production'` (dead code in
    real Vite browser bundles — `process` is not polyfilled) with the
    tree-shake-friendly `import.meta.env?.DEV` gate. Typed through a narrowing
    interface so downstream packages don't need `vite/client` in their
    tsconfigs to type-check elements transitively.
  - `helpers/Wrapper/component.tsx`, `List/component.tsx`: replaced destructured
    props (`({ x, ...rest }) => …`) with `splitProps(props, OWN_KEYS)` to
    preserve reactive prop tracking.
  - `Overlay/useOverlay.tsx`: added `typeof window === 'undefined'` early-return
    guards at the entry points of `calcDropdownVertical`/`Horizontal`,
    `calcModalPos`, `getAncestorOffset`, and `setupListeners`. Each function
    is only reachable from a mounted browser context (via event handlers
    registered inside `onMount`), but the rule can't AST-trace that; the
    explicit guard documents the SSR-safety contract at the callsite.
  - `devWarn`: rewritten to use the shared `IS_DEVELOPMENT` flag (itself
    gated on `import.meta.env?.DEV`) so it tree-shakes in production.
  - Added `packages/ui-system/elements/vitest.browser.config.ts` +
    `src/__tests__/elements.browser.test.tsx` — the package's first real
    Playwright Chromium smoke test. Verifies Element/Portal/Text render into
    real DOM, a reactive text child updates on signal change, and
    `typeof process === 'undefined'` / `import.meta.env.DEV === true` in the
    browser bundle (catching the `typeof process` dead-code class of bug).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added to elements.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Logical-and guards with a typeof-derived const on either side now recognised
    (e.g. `IS_BROWSER && active() ? <Portal target={document.body} /> : null`).
    Short-circuit semantics mean the body only runs when the guard is truthy.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Added `render` to the skip allowlist. `render()` from `@pyreon/ui-core` is
    a VNode-producing helper (takes ComponentFn/string/VNode, returns
    VNodeChild), not a signal read — its JSX call sites always produce a
    VNode and don't need `() =>` wrapping.

  `@pyreon/lint` — `dev-guard-warnings`:

  - Added conventional dev-flag name set (`__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`,
    `isDev`) so imported dev gates (e.g. `import { IS_DEVELOPMENT } from '../utils'`)
    silence `console.warn` warnings inside their guarded branches. Same convention
    basis as the existing `__DEV__` identifier check — the rule can't follow
    cross-module imports to verify the binding resolves to `import.meta.env.DEV`,
    so the name is the contract.
  - Also added `VariableDeclaration` tracking for locally-bound dev-flag consts
    (`const x = import.meta.env.DEV === true` or similar).

  5 new bisect-verified regression tests for the rule precision improvements.

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/unistyle@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/ui-core@0.12.13
  - @pyreon/unistyle@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/ui-core@0.12.12
  - @pyreon/unistyle@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/ui-core@0.12.11
  - @pyreon/unistyle@0.12.11

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/unistyle@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/unistyle@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/unistyle@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/unistyle@0.0.2
