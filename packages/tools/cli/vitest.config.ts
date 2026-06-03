import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  coverageThresholds: {
    statements: 95,
    branches: 85,
    functions: 95,
    lines: 95,
  },
})
