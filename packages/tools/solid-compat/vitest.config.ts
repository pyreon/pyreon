import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  coverageThresholds: {
    statements: 94,
    lines: 94,
    branches: 85,
    functions: 90,
  },
})
