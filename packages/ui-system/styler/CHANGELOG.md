# @pyreon/styler

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
