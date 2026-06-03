import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 95, lines: 94, branches: 95 },
})
