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
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code; its emit is verified
  // by behaviour in the @pyreon/native-compiler suite (golden corpus + coolgrid-native specs), which owns the toolchain lanes.
  coverageExclude: [
    'src/Col/styled.ts',
    'src/Row/styled.ts',
    'src/Container/styled.ts',
    'src/native-plugin.ts',
    'src/native-plugin/**',
  ],
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
