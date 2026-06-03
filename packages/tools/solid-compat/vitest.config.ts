import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  coverageThresholds: {
    statements: 95,
    lines: 95,
    branches: 95,
    functions: 95,
  },
})
