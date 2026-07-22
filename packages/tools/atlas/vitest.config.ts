import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
  },
})
