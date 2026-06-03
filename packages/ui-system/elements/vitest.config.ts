import { defineNodeConfig } from '@pyreon/vitest-config'

// Thresholds sit a couple points below the latest measured values so a
// small coverage drift doesn't fail CI unnecessarily. Overlay's
// SSR-fallback branches are tested directly against `positioning.ts` with
// `globalThis.window` stubbed — only the branches inside the React-like
// component boundary (happy-dom-only DOM events) remain legitimately
// harder to cover.
export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Bumped statements 88 → 90 in PR #324 to match the new floor
  // (actual 90.24%). Branches stays at 76 (actual 79.83%) and
  // functions at 84 (actual 86.02%) — Overlay's SSR /
  // happy-dom-only DOM event branches and ref-callback paths are
  // legitimately harder to cover; tracked via
  // BELOW_FLOOR_EXEMPTIONS for branches < 80.
  // Overlay positioning is browser-layout-dependent (viewport-fit
  // calcs need real DOMRect + scroll metrics). Exercised by
  // elements.browser.test.tsx + ui-showcase e2e — excluded from
  // node-side unit coverage.
  // Text/Content/helpers styled-callback files: theme-callback bodies
  // run inside `makeItResponsive` during real component mount —
  // exercised by elements.browser.test.tsx + ui-showcase e2e.
  coverageExclude: [
    'src/Overlay/positioning.ts',
    'src/Text/styled.ts',
    'src/helpers/Content/styled.ts',
  ],
  // Threshold history (post v8-ignore campaign cleanup):
  // - Pre-PR-1299 baseline: 91.27% branches
  // - PR #1299 (cosmetic): 96.19% via 18 /* v8 ignore */ annotations across 6 files
  //   (gaming the gate by ignoring Element equalize layout-measurement
  //   defensives, useOverlay dev-warns, Iterator/Wrapper defensives)
  // - Current: 91.27% branches via removal of cosmetic ignores
  //
  // The remaining ~37 uncov branches are defensive guards in:
  // - Element's equalize layout effect (ResizeObserver fallback paths)
  // - useOverlay dev-mode warns + positioning fallbacks
  // - Iterator/Wrapper optional-prop arms
  // These are exercised by elements.browser.test.tsx + ui-showcase e2e in
  // a real browser; vitest measures unit-test-process coverage only.
  coverageThresholds: {
    statements: 95,
    branches: 91,
    functions: 85,
    lines: 95,
  },
})
