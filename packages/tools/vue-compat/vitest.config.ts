import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  coverageThresholds: {
    statements: 85,
    branches: 80,
    functions: 90,
    lines: 85,
  },
})
