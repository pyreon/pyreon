import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
  excludeBrowserTests: true,
})
