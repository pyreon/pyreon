import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Exclude `.bench.ts` from coverage — benchmarks run under
  // `vitest bench`, not `vitest run`, so their source code
  // ends up in the denominator at 0% coverage and skews the
  // package's overall numbers (PR #323 finding).
  coverageExclude: ['**/*.bench.ts', '**/__tests__/index.ts'],
  coverageThresholds: {
    statements: 95,
    branches: 85,
    functions: 95,
    lines: 95,
  },
})
