import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: {
    statements: 88,
    branches: 80,
    functions: 85,
  },
})
