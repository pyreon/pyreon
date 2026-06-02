import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  coverageThresholds: { statements: 95, lines: 95, branches: 90 },
})
