# @pyreon/rocketstyle

## 0.12.14

### Patch Changes

- [#252](https://github.com/pyreon/pyreon/pull/252) [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 2 — browser smoke tests for rocketstyle + coolgrid + connector-document

  Adds real-Chromium Playwright smoke tests for three more ui-system
  packages. happy-dom can't compute styles from the injected stylesheet
  or resolve `@media` queries, so the rocketstyle → styler → DOM cascade,
  the coolgrid grid math, and the connector-document real-`h()`
  extraction pipeline went untested end-to-end.

  `@pyreon/rocketstyle` (`src/__tests__/rocketstyle.browser.test.tsx`,
  6 tests). Wraps a real `ComponentFn` (not `'div' as any`), matching
  production rocketstyle usage (Element/Text bases).

  - `.theme()` mounts and Chromium computes the authored color/padding
    via styler; emits a `pyr-*` class.
  - `state` prop swaps the resolved `$rocketstyle` theme.
  - `variant` layers on top of state.
  - `modifier` transform derives styles from the accumulated state theme.
  - `m(light, dark)` theme callback resolves per `PyreonUI` mode.
  - Reactive mode swap: `mode` is a signal on `PyreonUI`, rocketstyle's
    `$rocketstyleAccessor` reads `themeAttrs.mode` (ReactiveContext
    getter), styler's `isReactiveRS` effect observes the change and
    swaps classList in place — no remount. This is the only axis that
    survives the rocketstyle HOC spread (`{...filteredProps}` in
    `rocketstyleAttrsHoc` collapses `_rp()` getter props to values, so
    dimension props like `state={stateSig()}` aren't currently reactive
    end-to-end; mode flows via context, not props, so it stays live).

  `@pyreon/coolgrid` (`src/__tests__/coolgrid.browser.test.tsx`, 7 tests).
  Wraps in `PyreonUI` (deprecated `<Provider>` from @pyreon/unistyle
  replaced).

  - Container mounts with `display: flex; flex-direction: column`.
  - Col size=6/12 → ~50% of Row; two size=6 Cols sum to ~100%
    side-by-side.
  - `flex-basis: 25%` for size=3/12.
  - **columns != 12**: `theme.grid.columns = 6`, size=2/6 → 33.3333%
    — proves the math is `size / columns`, not hardcoded.
  - **`gap` subtraction**: Row `gap={24}`, Col size=6 emits
    `calc(50% - 24px)`; Chromium preserves the literal in computed
    `flex-basis`, col width < 50% of Row but > 40% (subtraction not
    failure).
  - **Responsive `size={[12, 6, 4]}`**: at the ~414px vitest viewport
    (below `sm`=576), the xs entry applies → size=12 → 100% of Row.

  `@pyreon/connector-document`
  (`src/__tests__/connector-document.browser.test.tsx`, 5 tests).

  - **Path A strict**: component body throws; if `extractDocumentTree`
    falls through to Path B and invokes the component, the test fails
    with the throw. Passing proves Path A reads `_documentProps` off
    the JSX vnode without invoking the component.
  - Path B: `extractDocumentTree` invokes the component to recover
    `_documentProps` from the post-call vnode (the rocketstyle
    attrs-HOC pattern).
  - Function-valued `_documentProps` resolve to LIVE values at
    extraction time — same vnode, signal mutated between calls, second
    extraction reads the new value.
  - Transparent (non-documentType) wrappers built with real `h()`
    flatten correctly.
  - `resolveStyles` produces a plain style record in the browser bundle
    (color/backgroundColor/fontSize=24/padding=[8,16] all parse; no
    Node-only dep leaks).

  Bisect-verified (load-bearing hot-path revert per suite):

  - **rocketstyle**: (a) emptied dimension theme merge → 3/6 failed
    (state, variant, modifier). (b) Static-returned `mode` in `useTheme`
    → 2/6 failed (reactive mode swap, m-callback dark-mode test).
    Restored, 6/6 pass.
  - **coolgrid**: (a) emptied Col `widthStyles` → 3/7 failed
    (size-ratio tests + flex-basis literal + gap + responsive).
    (b) Ignored `hasGap`, always plain percentage → gap-subtraction
    test failed with `calc(50% - 24px)` assertion. Restored, 7/7 pass.
  - **connector-document**: Path A strict test is self-bisecting —
    the component body throws, so any regression that causes the
    extractor to invoke it fails immediately with a real error.
    Additionally, gating Path B (`else if (false && typeof type ===
'function')`) → Path B + reactive accessor tests fail, 2/5.
    Restored, 5/5 pass.

  Also removes the three packages from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts`. 7 packages remain pending
  (ui/{theme,components,primitives} + 4 compat layers).

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Fix generic type defaults in attrs and rocketstyle — use empty objects instead of Record<string, unknown> to preserve component prop types through SpreadTwo merges

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/styler@0.0.2
