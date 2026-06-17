import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 99, lines: 99, branches: 98, functions: 99 },
})
