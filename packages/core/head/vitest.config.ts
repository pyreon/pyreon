import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  coverageThresholds: { statements: 95, lines: 94 },
  excludeBrowserTests: true,
})
