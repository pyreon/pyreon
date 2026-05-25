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
  coverageThresholds: {
    statements: 90,
    branches: 90,
    functions: 90,
  },
  overrides: {
    test: { testTimeout: 15000 },
  },
})
