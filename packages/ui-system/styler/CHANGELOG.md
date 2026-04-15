# @pyreon/styler

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
