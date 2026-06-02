import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 95, functions: 94, lines: 94 },
})
