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
  coverageExclude: ['src/Overlay/positioning.ts'],
  coverageThresholds: {
    statements: 94,
    branches: 76,
    functions: 84,
    lines: 94,
  },
})
