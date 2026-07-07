# @pyreon/styler

## 0.41.1

### Patch Changes

- [#2108](https://github.com/pyreon/pyreon/pull/2108) [`12ce8e7`](https://github.com/pyreon/pyreon/commit/12ce8e72ffeff8b692db698301431674f7f87c40) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two migration-surfaced fixes:

  - **@pyreon/styler**: `insertGlobal` now unwraps a single outer `@layer name{…}` block when `@layer` is unsupported (happy-dom, older engines), so global rules (e.g. a CSS reset) still land in the DOM via source order instead of being silently dropped with a per-insert DOMException warning. The scoped `insert()` path already gated `@layer` on `supportsLayer`; `insertGlobal` was the one path that didn't.
  - **@pyreon/form**: the "field not found" errors (`useField`, `setFieldValue`, `setFieldError`) now tell you the fix — declare the field in `useForm({ initialValues })` — and state that `@pyreon/form` does not auto-register fields on first use (unlike react-hook-form). Turns a "component threw during setup → blank UI" mystery into a self-explaining error.

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

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- [#1891](https://github.com/pyreon/pyreon/pull/1891) [`448b689`](https://github.com/pyreon/pyreon/commit/448b689cfd0a9346c13aa1f836a2467bb12d4fcb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Extend the dev-mode resolved-CSS validator (`sheet.insert`) to warn on `content-visibility: auto` resolved without `contain-intrinsic-size` — a Cumulative Layout Shift footgun (the browser estimates the off-screen box height then corrects it on render, shifting content below). This is the runtime safety net complementing the static `pyreon/content-visibility-needs-intrinsic-size` lint rule: it catches the case where the CSS is computed at runtime, which the static rule can't see. Dev-only (tree-shaken from production), warns once per finding, ReDoS-safe scan.

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

### Minor Changes

- [#1662](https://github.com/pyreon/pyreon/pull/1662) [`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CPSE: opt-in default-pipeline integration (`init({ styleExtraction: true })`)

  The `styled` / `Element` default pipeline can now route through Custom-Property
  Style Extraction, behind an opt-in flag. With `init({ styleExtraction: true })`,
  `PyreonUI` wires `@pyreon/styler`'s new `setStyleExtraction` (injecting
  unistyle's `cpseRewrite`) so a **non-reactive** styled component's resolved
  declarations become a value-agnostic rule (`prop: var(--u-…)`) + per-instance
  inline custom properties. Distinct values then share **ONE** CSS rule (O(1)
  rules — the rule-bloat win for high-cardinality apps); the value rides inline.

  - **Off (default) = byte-identical** classic path. Every CPSE branch is gated on
    the flag; the full styler + ui-core + elements + rocketstyle + coolgrid +
    ui-components suites (node + real-Chromium) pass unchanged.
  - **Scope:** the non-reactive (static + SSR) resolve — plain `styled` + `Element`
    (the `$element` path; a `cpseVarsCache` keyed by `$element` makes the value
    survive `elClassCache` hits). The **reactive** (rocketstyle accessor) path
    stays classic.
  - **Honest limits:** it is **O(1) rules, NOT O(1) resolve** — the styler still
    resolves per distinct `$element` (it caches by value-bearing identity); the
    win is rule/bundle, not resolve-CPU. It also currently extracts **every** flat
    declaration including constants (`position: relative`, `display: …`), which
    inflates inline-style bytes — a future refinement can skip non-value-varying
    declarations. Measure per app (the win-matrix test) before enabling.

  `setStyleExtraction(enabled, rewrite?)` is exported from `@pyreon/styler`
  (`@internal` — wired by ui-core). New `init` option `styleExtraction: boolean`.

  Proven: a dedicated real-Chromium suite — flag-on a function-interpolated
  `styled` → value-agnostic class + inline var + N distinct values share ONE
  class; flag-off → classic (N classes, no var, the self-discriminating contrast);
  a **real `<Element>`** fires CPSE (renders correctly via var-indirection,
  distinct gaps share one class, cache-hit keeps vars); a pre-existing inline
  style is preserved. The `doResolve` CPSE branch is bisect-verified (neutering it
  fails the flag-on specs).

- [#1720](https://github.com/pyreon/pyreon/pull/1720) [`3d47b98`](https://github.com/pyreon/pyreon/commit/3d47b987d244be4ad6b5453cd07ed39be85427bf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `styled()` components now accept `innerRef` as a `ref` alias, uniform with `@pyreon/elements` Element (which has always supported `innerRef`). Previously `<Styled innerRef={fn}>` silently dropped the ref — the callback never fired (e.g. a `@pyreon/virtual` scroll container mounted via `innerRef` was never captured, leaving the virtualized list empty). A styled component renders a single DOM node, so `ref` already targets it; `innerRef` is now normalized to `ref` at both the static and dynamic component paths (explicit `ref` wins; `innerRef` is never forwarded to the DOM as an attribute). Getter-shaped reactive props and symbol-keyed brands are preserved through the normalization. Zero-cost when `innerRef` isn't used.

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1618](https://github.com/pyreon/pyreon/pull/1618) [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore` comments on genuinely
  unreachable/defensive branches plus a handful of behavior-preserving
  restructures (dead `else if` → `else`, a redundant early-return removal, an
  extract-variable). No runtime behavior change; verified by the existing node +
  real-Chromium browser suites.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Minor Changes

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CSS-variables mode — ui-system sweep + safety net + perf fast paths:

  - `@pyreon/styler`: dev-mode resolved-CSS validator in `sheet.insert` — warns (once per finding, `[Pyreon]`-prefixed) on `NaN` values (JS arithmetic on a var token), `undefined`/`null` values, and malformed `var()` concatenation (`var(--x)99` alpha-suffix hacks), naming the offending declaration. Tree-shaken from production.
  - `@pyreon/coolgrid`: grid math is var-aware — a `var()`/`calc()` gap or gutter now emits native `calc()` spacing (Row margins, Col gap-margin, Col width) instead of silently skipping spacing / emitting the malformed `var(--x)px` (multiplication, not division — `calc(x / -2)` invalidates the whole shorthand).
  - `@pyreon/unistyle`: `resolveCssVarReferences(value, registry)` — inline `var(--…)` references (incl. fallbacks) back to raw emitted values for consumers that can't evaluate custom properties (document/PDF export, devtools). `calc()` is inlined, not evaluated.
  - `@pyreon/runtime-dom`: `_rsCollapse` single-class fast path — identical light/dark classes (what the cssVariables collapse produces) skip the mode binding entirely (zero subscription, zero disposer).

  Measured (real Chromium): 100 components × 10 mode flips — classic 5.4ms vs cssVariables 1.7ms (3.2×), with zero `styler.resolve` / `rocketstyle.getTheme` work; the REAL `@pyreon/ui-components` Button + full default theme render var-safe with zero validator findings.

  Security: `resolveCssVarReferences` is implemented as a linear character scan (paren-depth-aware) rather than a regex, eliminating a polynomial-ReDoS surface (CodeQL `js/polynomial-redos`) on the var-fallback parse — input can be library/theme-author-controlled.

- [#1466](https://github.com/pyreon/pyreon/pull/1466) [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streaming SSR no longer FOUCs Suspense-boundary content. `@pyreon/styler`'s `sheet.flushSSRPending()` (new) returns CSS rules collected since the previous flush + advances a watermark; the SSR-only module init registers it on `globalThis.__PYREON_STYLER_FLUSH__`. `@pyreon/runtime-server`'s `renderToStream` calls the hook (a) once after the synchronous shell render — emitting `<style data-pyreon-stream="shell">…</style>` inline at the top of the app body so shell content is styled before any Suspense resolves; (b) inside every `streamSuspenseBoundary`, BEFORE the `<template>`, so each boundary's resolved HTML arrives with its styles already in the page. No hard `runtime-server → styler` dependency (mirrors the `__pyreon_count__` perf-counter and SSG-plugin lookup pattern); the boundary path is a no-op when styler isn't loaded. Bundle cost: ~239 gz across the two packages (+129 styler, +110 runtime-server) — both within budget. Closes the FOUC observable in `examples/cpa-pw-app-solid` (`mode: 'ssr', ssr: { mode: 'stream' }`). Bisect-verified at both layers: 13 sheet unit specs cover the watermark / `@layer` ordering / reset semantics; 7 runtime-server integration specs cover the shell + per-boundary flush ordering, the `</style` escape, the multi-boundary case, and the no-hook graceful no-op. Companion cleanup: stale HMR-staleness comment in `styler/styled.tsx` was rewritten to reflect that the `onSheetClear` subscriber wired at module top already drops the static-VNode cache on `sheet.clearAll()` (the comment documented a gap that had already been closed).

### Patch Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

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

- [#1304](https://github.com/pyreon/pyreon/pull/1304) [`f4ea1a1`](https://github.com/pyreon/pyreon/commit/f4ea1a1e5af38b37b4eb2feb14f4594e3c3c3482) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(styler): SSR fast path for reactive `DynamicStyled` components

  On the server every render is a single pass with no client reactivity, yet
  `DynamicStyled`'s reactive branch (when `$rocketstyle`/`$rocketstate` are
  accessors — i.e. every rocketstyle component) allocated a `computed`
  subscription, a `ref` closure, and a `renderEffect` per component. All three
  are client-only dead weight server-side: refs never fire during
  `renderToString`, and no signal changes within a single SSR pass — so they
  allocate and subscribe but emit zero HTML.

  `DynamicStyled` now branches on a module-level `IS_SERVER` (`typeof document
=== 'undefined'`): on the server it resolves the class once and emits,
  skipping the computed/ref/renderEffect entirely. The emitted className is
  byte-identical to the reactive path's initial value, so hydration (where the
  client re-establishes the reactive machinery) sees no mismatch.

  Measured via `renderToString` of 2,000 reactive styled components, tight
  drift-controlled A/B (8 pairs): ~9.7ms → ~1.95ms (~5×, 95% CI
  [+7.54, +7.91ms], 8/8 faster). The win scales with the cache-hit rate —
  largest for pages that repeat the same components (buttons/cards), where the
  reactive-machinery allocation dominates the cached resolve.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.28.1

### Patch Changes

- [#1231](https://github.com/pyreon/pyreon/pull/1231) [`e975f3a`](https://github.com/pyreon/pyreon/commit/e975f3aa9a5ca0fa7983c8f4fa47c412cea7d735) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to pass its own gate + raise functions / lines to ≥95%. Add 11 tests covering SSR-mode `injectRules` buffering + idempotency, `resetSSRBuffer`, `getStyleRules` return-copy contract, `buildProps` reactive-class-getter merging (3 cases: with generated, generated-only, user-only), and `injectRules` insertRule-throw warn path. Coverage 93.16% → 94.83% statements, 83.55% → 85.11% branches, 93.33% → 97.33% functions, 94.48% → 96.03% lines. Bump thresholds: branches 80 → 85, functions 94 → 95, lines 94 → 95.

- [#1281](https://github.com/pyreon/pyreon/pull/1281) [`4058727`](https://github.com/pyreon/pyreon/commit/40587271deeb30f968dcf297ee7781e2993ca1e8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift statement coverage 94.83% → 95.89% and drop `@pyreon/styler` from `BELOW_FLOOR_EXEMPTIONS`. Added `__tests__/coverage-edges.test.ts` covering: (a) the `WeakMap` fallback cache hit path in `createStyledComponent` (alternating same-strings + different-tag pattern), (b) the `styled` Proxy guards for `prototype` / `$$typeof`, (c) per-tag factory caching identity. Vitest threshold `statements: 94 → 95`.

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

### Patch Changes

- [#1154](https://github.com/pyreon/pyreon/pull/1154) [`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(rocketstyle, styler): reactive props on chained rocketstyle components

  A downstream consumer reported reactive props on rocketstyle-wrapped
  components (`<Button href={signal() ? a : b}>`) stayed static through the
  chained HOC pipeline (`.config()` / `.attrs()` / `.theme()` / `.states()`
  / `.sizes()` / `.compose()`). Investigation found TWO distinct value-copy
  sites that the PR [#584](https://github.com/pyreon/pyreon/issues/584) reactive-prop sweep missed:

  **1. `@pyreon/rocketstyle/src/context/createLocalProvider.ts`** — the HOC
  inserted between `EnhancedComponent` and the styled leaf when
  `options.provider: true` (top-level rocketstyle wrappers including all
  ui-components Buttons). Pre-fix shape used a parameter-destructure
  (`({ onMouseEnter, …, ...props })`) and a final value-spread
  (`{ ...props, ...events, $rocketstate }`) — both fire every getter
  descriptor on the incoming props at HOC setup, snapshotting the
  `_rp(() => signal())`-driven reactive props that `makeReactiveProps`
  installs.

  Fix: receive `props` as a single argument; read event-handler keys lazily
  inside the event closures (so handler-descriptor getters fire at
  event-fire time, not HOC setup); build `restProps` via `omit()` from
  `@pyreon/ui-core` (descriptor-copy); merge with `mergeDescriptors` from
  `@pyreon/rocketstyle/utils/attrs`.

  **2. `@pyreon/styler/src/forward.ts:buildProps`** — class-merging
  code value-read `rawProps.class` even when the descriptor was a getter,
  capturing the snapshot and emitting a static merged class. The pre-fix
  comment "Reading rawProps.class synchronously is fine" was wrong for the
  reactive case.

  Fix: detect getter-shaped `class` / `className` descriptors and wrap the
  merge in a getter that re-reads + re-composes on every access. The
  emitted getter carries the reactive subscription through to `applyProp`
  which DOES fire its renderEffect on descriptor read. Static class still
  takes the simple value-merge fast path.

  **Heavy test coverage** added to lock the contract — bisect-verified at
  both unit AND browser layers:

  - `createLocalProvider.descriptors.test.ts` (14 new unit specs) — fires/no-fires
    counts on getter descriptors, descriptor verbatim forwarding, mixed
    static + reactive props, large prop sets, edge cases (empty props,
    $rocketstate accessor function form, symbol-keyed props,
    event-handler interaction)
  - `reactive-prop-chained.browser.test.tsx` (19 new real-Chromium specs):
    - per-chain-shape reactive `href` (8 cases: bare / .config / .attrs /
      .theme / .states / .sizes / .compose / full chain)
    - reactive ternary expressions
    - reactive `class` / `data-*` / `aria-*`
    - multiple independent reactive props on one component
    - mixed reactive + static prop forwarding
    - pseudo-state event handlers + reactive props coexist

  Bisect:

  - revert `createLocalProvider.ts` → 6 of 14 unit tests fail with
    `expected 1 to be +0` (getters fired at HOC entry when they should fire
    zero times)
  - revert `styler/forward.ts` → 1 of 19 browser tests fails (reactive
    class no longer swaps)
  - both restored → 309/309 unit + 31/31 browser pass

  Adjacent suites stay green: `@pyreon/styler` 428/428, `@pyreon/elements`
  497/497, `@pyreon/ui-components` (all green).

- [#1151](https://github.com/pyreon/pyreon/pull/1151) [`5af2864`](https://github.com/pyreon/pyreon/commit/5af28641ab1ad31a0c3feaf1c6a95163e83935d3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: cite concrete browser baseline for native CSS Nesting

  The styler emits `&:hover{}` native CSS nesting and requires Chrome/Edge
  112+ (Apr 2023), Safari 16.5+ (May 2023), Firefox 117+ (Aug 2023). The
  README previously said "modern browsers" without concrete versions.
  Docs-only — no code change.

## 0.26.0

### Patch Changes

- [#1150](https://github.com/pyreon/pyreon/pull/1150) [`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(styler, vite-plugin): rocketstyle-collapse resolver serializes resolve() + resets SSR buffer per render-pair

  Two entangled bugs in the rocketstyle-collapse pipeline, both surfaced in the post v0.25.1 framework audit (findings [#7](https://github.com/pyreon/pyreon/issues/7) + [#8](https://github.com/pyreon/pyreon/issues/8)). Bundled into one PR because the fix vector is shared.

  ### Bug [#8](https://github.com/pyreon/pyreon/issues/8) — `ssrBuffer` monotonic accumulation

  `StyleSheet.ssrBuffer` is a module-level singleton (`packages/ui-system/styler/src/sheet.ts:44`). `insert()` / `insertKeyframes()` append to it during SSR; `getStyleRules()` returns the full buffer. It was reset only on `reset()` (per-request) or `clearAll()` (HMR) — **never between successive `resolve()` calls in a build**.

  Result: resolving site A populated the buffer with A's rules. Resolving site B then captured `[...A's rules, ...B's rules]`. By the Nth site, the captured payload contained all 1..N sites' rules. The FNV-1a `ruleKey` became unique-per-site, defeating the cross-site `injectedBundles` runtime dedup the design relied on. Inline CSS payload grew O(N²) in collapsed site count.

  ### Bug [#7](https://github.com/pyreon/pyreon/issues/7) — Concurrent `resolve()` cross-contamination

  `createCollapseResolver().resolve()` is async — awaits 4 `ssrLoadModule` + 2 `renderToString`. Vite `transform()` hooks fire in parallel across files. Two concurrent `resolve()` calls shared the SAME singleton sheet. Site A's `renderToString(light)` and site B's `renderToString(light)` interleaved → A's `getStyleRules()` captured rules from B's still-in-flight render → wrong rules cached under A's key. Persisted for the build's lifetime.

  ### Fix — single-flight queue + per-render-pair buffer reset

  Two surgical changes:

  1. **`StyleSheet.resetSSRBuffer()`** (new public method, `sheet.ts`): clears ONLY `ssrBuffer`. Leaves `cache` / `insertCache` / `domRules` / **`injectedBundles`** intact (the cross-site dedup guard MUST survive across resolves).

  2. **Single-flight promise chain + reset-before-renders** (`rocketstyle-collapse.ts`): every `resolve(input)` chains onto a module-level `resolveChain = resolveChain.then(success, failure)`. The body (now extracted as `doResolve`) calls `sheet.resetSSRBuffer()` AFTER the cache-hit short-circuit and BEFORE the light/dark `renderToString` pair. The `.then(success, failure)` shape ensures a single rejected resolve doesn't poison the chain.

  Combined effect: buffer is fresh per pair; concurrent calls observe the reset in strict serial order; cross-site dedup is restored. Wall-clock builds become serial in the resolver (vs the prior pseudo-parallel-but-broken behavior) — acceptable trade-off for build-time correctness; collapse is opt-in and most builds resolve only a handful of distinct sites.

  ### Bisect-verify

  3 new specs in `packages/tools/vite-plugin/src/tests/rocketstyle-collapse.test.ts` (`audit [#7](https://github.com/pyreon/pyreon/issues/7)+[#8](https://github.com/pyreon/pyreon/issues/8): resolver serialization + per-site buffer isolation` describe block):

  **Spec A — sequential, isolates bug [#8](https://github.com/pyreon/pyreon/issues/8)**: resolve 3 distinct sites sequentially. Assert each site's `.rules` array contains ONLY its own classes (no accumulated rules from prior sites). Revert ONLY the `resetSSRBuffer()` call → fails with `AssertionError: expected 0 to be greater than 0` on `expect(ruleInAnotInB.length).toBeGreaterThan(0)` — B's captured rules become a strict superset of A's (the accumulation signature).

  **Spec B — concurrent, isolates bug [#7](https://github.com/pyreon/pyreon/issues/7)**: resolve 2 sites via `Promise.all`. Assert the resulting FNV ruleKeys differ (proves no cross-contamination). Revert ONLY the chain serialization → fails with `AssertionError: expected 'ug96np' not to be 'ug96np' // Object.is equality` on `expect(a.key).not.toBe(b.key)` — concurrent renders interleave against the same singleton sheet, see the merged buffer at the same moment, produce IDENTICAL keys.

  **Spec C — sheet identity proof**: 2 consecutive resolves with unique dimension tuples both produce non-empty `rules.length` AND distinct keys. Only possible if the same singleton sheet survives between resolves (proven indirectly via the behavioral chain — direct `===` check was deliberately omitted because `ssrLoadModule` returns a wrapping module namespace, not the singleton directly).

  Reverting BOTH the reset + the chain fails Specs A and B simultaneously. Restoring → 3/3 audit specs + 255/255 vite-plugin + 428/428 styler + both typechecks clean.

  ### API contract

  - `StyleSheet.resetSSRBuffer()` is a NEW public method on the styler. Internal-use (intended for the rocketstyle-collapse resolver during SSR builds). No breaking changes — it's purely additive.
  - `CollapseResolver.resolve()` signature unchanged. Behavior change: calls are serialized via an internal chain. Wall-clock latency increases for parallel transforms (N sites → N × render latency), but dedup integrity is guaranteed.
  - No public API surface changes for end users.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

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

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

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

- [#642](https://github.com/pyreon/pyreon/pull/642) [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Repo sweep (round 2): a real memory leak + cross-compat duplication removal.

  **`@pyreon/styler` — unbounded `insertCache` + DOM `cssRules` growth (memory leak).** `evictIfNeeded()` trimmed ONLY the `cache` Map. The cssText-keyed `insertCache` (large keys — full CSS text) and the live `<style>` tag's `CSSStyleSheet.cssRules` were never evicted, so `maxCacheSize` bounded the _smallest_ of the three storage layers while the two memory-heavy ones grew for the entire process lifetime. Any app generating many distinct CSS strings (signal-driven dynamic styles, per-instance computed themes) leaked Map entries + live DOM rules forever. Fix: a `className → Set<icKey>` reverse index plus a `className → CSSRule[]` object-ref index (object refs survive `deleteRule()` reindexing) let `evictKeys()` drop all three layers in lockstep — `cache.delete` + `insertCache.delete` + descending-index `deleteRule()`. `reset()` / `clearCache()` / `clearAll()` clear the two new indices too. `maxCacheSize` now genuinely bounds memory. No API/behaviour change for steady-state apps; dedup correctness preserved (re-inserting an evicted rule yields the same deterministic className + exactly one live DOM rule). Bisect-verified: reverted `evictKeys` to pre-fix cache-only behaviour → `insertCache stays bounded` failed `expected 300 to be ≤ 75`, `live DOM cssRules count` failed `expected 180 to be ≤ 47`; restored → 13/13.

  **`@pyreon/core` + `@pyreon/react-compat` + `@pyreon/preact-compat` — compat duplication removal (behaviour-preserving).** `shallowEqual` (memo / useState bailout) was copy-pasted byte-identically into `react-compat/index.ts` and `preact-compat/hooks.ts`; the React/Preact DOM-prop mapping (`className→class`, `htmlFor→for`, `onChange→onInput`, `autoFocus`, `defaultValue`/`defaultChecked`, authoring-only strip) was near-duplicated across both jsx-runtimes (only divergence: React also stripped `suppressContentEditableWarning` — a no-op for Preact, so unifying is behaviour-preserving). Consolidated into a new `@pyreon/core/compat-shared.ts` (`shallowEqualProps`, `mapCompatDomProps`) — core is already a dependency of every compat package and already hosts the sibling cross-compat module `compat-marker.ts` (`nativeCompat`/`isNativeCompat`). Both packages now import the canonical helpers (aliased to local names — zero call-site churn).

  Validation: lint 0 errors; typecheck clean (styler + core + react-compat + preact-compat); styler 413/413, core 497/497, react-compat 224/224, preact-compat 157/157; styler browser smoke 9/9; e2e `ui-regression` 26/26 (styler/rocketstyle real-app gate); e2e `compat-layers` 12/12 (react/preact/vue/solid real-app gate); new `compat-shared.test.ts` 13/13.

  **Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor. That's a correctness-sensitive perf refactor, not a mistake / edge case / leak / duplicate, so it's out of scope for a behaviour-preserving sweep. `@pyreon/styler` `internElementBundle` css-prop interning ([#626](https://github.com/pyreon/pyreon/issues/626)-documented) — a distinct optimization, not a leak; its own PR. No other new memory leak found this round (prior sweeps already fixed signal.\_d / computed.direct / useSortable / ISR).

- [#628](https://github.com/pyreon/pyreon/pull/628) [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/styler` onto the manifest-driven docs pipeline.

  `@pyreon/styler` is the CSS-in-JS engine (`styled` / `css` / `keyframes` / `createGlobalStyle` / `useCSS` / theming / `StyleSheet`) — one of the most-queried real-API surfaces in the ui-system, but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region**. `get_api(styler, styled|css|useTheme|…)` 404'd. PR C of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server — all merged).

  **Added** `packages/ui-system/styler/src/manifest.ts` via `defineManifest()` — **19 `api[]` entries** covering the consumer-facing surface (`styled`, `css`, `keyframes`, `createGlobalStyle`, `useCSS`, `useTheme`, `useThemeAccessor`, `ThemeProvider`, `ThemeContext`, `createSheet`, `StyleSheet`, `sheet`, `resolve`, `normalizeCSS`, `resolveValue`, `clearNormCache`, `buildProps`, `filterProps`, `isDynamic`) with accurate signatures + dense summaries + the real CSS-in-JS foot-guns in `mistakes[]`: `$`-transient props are not forwarded to the DOM; `css`/`keyframes`/`createGlobalStyle` return lazy/name/component values (not strings, not side-effecting); `useTheme()` snapshots vs `useThemeAccessor()` tracks; `buildProps`/`filterProps` copy DESCRIPTORS not values to preserve the `_rp` reactive-prop contract; singleton-sheet-vs-`createSheet` isolation. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (between `@pyreon/unistyle` and `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — styler already had one), the `llms-full.txt` `## @pyreon/styler` section, and the 19-entry MCP region.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (styler + mcp); styler 410 tests, manifest 135 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + foot-gun-catalog assertions locally; `check-manifest-depth` passes (styler enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  **Authoring note for the next ui-system migration**: `@pyreon/manifest`'s `renderStringLiteral` serializer escapes backtick + `${` when emitting MCP entries into `api-reference.ts`, but does NOT escape literal backslashes. A `summary`/`mistakes` string whose RESOLVED value contains a literal `\` (e.g. from over-escaped nested `` \`…\``` code spans) emits `\\\ `` → the raw backtick prematurely closes the generated template literal → `api-reference.ts` parse error. Keep manifest prose backslash-free: use plain single-backtick code spans for identifiers, never nested backtick-in-backtick escapes; `${`-in-prose is fine (serializer-escaped, round-trips). Documented in `.claude/rules/anti-patterns.md`.

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
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- [#561](https://github.com/pyreon/pyreon/pull/561) [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `sheet.clearAll()` now resets `styled()`'s `staticComponentCache` (WeakMap of cached `ComponentFn` references) and `_hotCache` (single-entry hot ComponentFn slot) via the new `onSheetClear` subscriber registry. Pre-fix, `clearAll()` flushed the CSSOM rules + dedup cache but left the per-template `StaticStyled` ComponentFn references alive — those closures still returned the OLD class names (now deleted from the DOM), so post-`clearAll()` renders produced markup with class attributes that pointed at nothing. The leak was invisible in normal app shape (apps don't call `clearAll()` in production) but bit HMR cycles + test suites that reset the sheet between cases. Mirrors vitus-labs commit. Scoped to the singleton sheet — `createSheet()` instances don't fire the hook (per-request SSR isolation has no shared subscribers to invalidate).

- [#562](https://github.com/pyreon/pyreon/pull/562) [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pre-build a cached VNode for `StaticStyled` renders that pass no extra runtime props. The empty-`rawProps` + `ref == null` fast path skips the per-render `h()` allocation and prop spread by returning a shared VNode object. Companion to the `onSheetClear`-driven cache reset (separate PR): the cached VNode is invalidated whenever the underlying stylesheet is cleared, so HMR cycles + test resets don't serve stale class names. Mirrors vitus-labs commit. New `styler.staticVNode.hit` perf counter tracks cache utilization.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Minor Changes

- [#258](https://github.com/pyreon/pyreon/pull/258) [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Performance rearchitecture: reactive theme/mode/dimension switching via computed (not effect).

  - **styler**: `DynamicStyled` uses one `computed()` per component (not `effect()`) to track theme + mode + dimension signals. The resolve itself runs `runUntracked()` to prevent exponential cascade. String-equality memoization eliminates redundant DOM updates. Per-definition WeakMap cache (Tier 2) skips resolve entirely for repeated identical inputs.
  - **styler**: `ThemeContext` is a `createReactiveContext<Theme>`. `useThemeAccessor()` returns the raw accessor for tracking inside computeds.
  - **ui-core**: `PyreonUI` nested `inversed` prop inherits parent mode reactively — inner section automatically flips when outer mode changes.
  - **unistyle**: `styles()` uses key→index lookup (Tier 1) — 257 descriptor iterations reduced to ~10-20 per call.
  - **rocketstyle**: passes `$rocketstyle`/`$rocketstate` as function accessors tracked by the styled computed.
  - **router**: `RouterLink` guards non-string `props.to` in activeClass (fixes SSR crash with `styled(RouterLink)`).
  - **core**: `popContext()` is a silent no-op on empty stack.

  Expected impact: 2+ GB memory → < 100 MB, 20s render → < 2s for 150-component pages.

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

- [#248](https://github.com/pyreon/pyreon/pull/248) [`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 1 — browser smoke tests for styler + unistyle

  Adds real-Chromium Playwright smoke tests for two ui-system packages that
  previously only ran under happy-dom. happy-dom cannot resolve `@media`
  queries or compute styles from injected stylesheets, so the existing unit
  tests never exercised the hot paths those packages were built for.

  `@pyreon/styler`:

  - `src/__tests__/styler.browser.test.tsx` (8 tests): `styled('div')\`…\``mounts into real DOM with the generated`pyr-_`class; Chromium
resolves the authored styles (color/padding) via the injected
stylesheet; function interpolations resolve per-render against props
(verified`isDynamic`returns true for arrow fns →`DynamicStyled`path); different tags (div/span/button) produce distinct elements;`ThemeProvider`injects a theme consumed by themed components;`keyframes` registers an animation name (`pyr-kf-_`prefix, via`String(fadeIn)`) that Chromium applies; standalone `css\`…\``CSSResult interpolates into`styled()`and resolves in the cascade;
CSS rules are queryable via`document.styleSheets`.
  - Added `vitest.browser.config.ts`, `test:browser` script, and
    `@pyreon/test-utils` + `@vitest/browser-playwright` devdeps.
  - Wired `nodeExcludeBrowserTests` into the node vitest config so regular
    `bun run test` skips `*.browser.test.*` files.

  `@pyreon/unistyle`:

  - `src/__tests__/unistyle.browser.test.tsx` (6 tests): `enrichTheme`
    attaches sorted breakpoints + media helpers to `theme.__PYREON__`; an
    inline `@media (min-width: …)` rule that styler emits is actually
    resolved by Chromium at the current viewport (the under-viewport
    breakpoint applies, the over-viewport one does not); `<Provider>`
    enrichment feeds `styled()` + `css` interpolation functions via
    `p.theme` (no fallback color — a broken Provider trips the assertion
    loudly); `makeItResponsive` resolves a breakpoint-OBJECT responsive
    prop end-to-end through normalize→transform→optimize→media-emit and
    Chromium picks the correct breakpoint at the current viewport;
    `makeItResponsive` resolves a breakpoint-ARRAY responsive prop
    (mobile-first cascade) and Chromium applies the correct value;
    `value()` / `stripUnit()` round-trip identically in the browser.
  - Same vitest.browser.config.ts / script / devdep wiring as styler.

  Bisect-verified (two rounds — light flip + load-bearing hot-path
  revert):

  - styler (light): changed `KeyframesResult` name prefix from `pyr-kf-`
    to `broken-` — keyframes test failed. Restored, 8/8 passed.
  - styler (load-bearing): no-op'd `this.sheet.insertRule(...)` in
    `StyleSheet.insert` — 6/8 tests failed (every test that asserts a
    computed style or queryable rule). Restored, 8/8 passed.
  - unistyle (light): hard-coded `__PYREON__` to `{ sortedBreakpoints:
undefined, media: undefined }` — enrichment test failed. Restored,
    6/6 passed.
  - unistyle (load-bearing): replaced the `media[item]\`${result};\``emit in`makeItResponsive`with`return ''` — both responsive-prop
tests failed (`expected '8px' to be '0px'`). Restored, 6/6 passed.

  Also removes `packages/ui-system/styler/` and `packages/ui-system/unistyle/`
  from `PHASE_5_PENDING_PACKAGES` in `scripts/check-browser-smoke.ts`. The
  self-expiring exemption check passes (10 packages still pending).

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

## 0.1.2

## 0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages
