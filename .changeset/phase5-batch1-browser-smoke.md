---
"@pyreon/styler": patch
"@pyreon/unistyle": patch
---

T1.1 Phase 5 Batch 1 — browser smoke tests for styler + unistyle

Adds real-Chromium Playwright smoke tests for two ui-system packages that
previously only ran under happy-dom. happy-dom cannot resolve `@media`
queries or compute styles from injected stylesheets, so the existing unit
tests never exercised the hot paths those packages were built for.

`@pyreon/styler`:

- `src/__tests__/styler.browser.test.tsx` (8 tests): `styled('div')\`…\``
  mounts into real DOM with the generated `pyr-*` class; Chromium
  resolves the authored styles (color/padding) via the injected
  stylesheet; function interpolations resolve per-render against props
  (verified `isDynamic` returns true for arrow fns → `DynamicStyled`
  path); different tags (div/span/button) produce distinct elements;
  `ThemeProvider` injects a theme consumed by themed components;
  `keyframes` registers an animation name (`pyr-kf-*` prefix, via
  `String(fadeIn)`) that Chromium applies; standalone `css\`…\``
  CSSResult interpolates into `styled()` and resolves in the cascade;
  CSS rules are queryable via `document.styleSheets`.
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
- unistyle (load-bearing): replaced the `media[item]\`${result};\``
  emit in `makeItResponsive` with `return ''` — both responsive-prop
  tests failed (`expected '8px' to be '0px'`). Restored, 6/6 passed.

Also removes `packages/ui-system/styler/` and `packages/ui-system/unistyle/`
from `PHASE_5_PENDING_PACKAGES` in `scripts/check-browser-smoke.ts`. The
self-expiring exemption check passes (10 packages still pending).
