import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  coverageThresholds: {
    statements: 94,
    branches: 84,
    functions: 94,
    lines: 94,
  },
})
