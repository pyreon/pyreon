import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 95, lines: 94 },
})
