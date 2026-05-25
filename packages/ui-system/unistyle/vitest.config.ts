import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: {
    statements: 95,
    branches: 90,
    functions: 95,
  },
})
