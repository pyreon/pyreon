import { defineNodeConfig } from '@pyreon/vitest-config'

// Logic lives in src/index.ts; opt in to measuring it.
export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
})
