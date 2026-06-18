import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Excluded from Node-side coverage — these files are CSS-in-JS
  // styled-component templates whose inner `styles` callback only
  // runs when the styler resolver mounts a component via the real
  // styler runtime. Exercised end-to-end by
  // `coolgrid.browser.test.tsx` (Playwright Chromium). PR #323 finding.
  coverageExclude: ['src/Col/styled.ts', 'src/Row/styled.ts', 'src/Container/styled.ts'],
  // Node-suite coverage is 100% on all four metrics (the browser-only
  // styled.ts templates are coverageExclude'd above). Thresholds sit at 99
  // to leave a 1pp drift margin while holding the >98 bar.
  coverageThresholds: {
    statements: 99,
    lines: 99,
    branches: 99,
    functions: 99,
  },
  overrides: {
    test: { testTimeout: 15000 },
  },
})
