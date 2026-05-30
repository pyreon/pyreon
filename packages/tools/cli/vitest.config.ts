import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  coverageThresholds: {
    statements: 94,
    branches: 80,
    functions: 94,
    lines: 94,
  },
})
