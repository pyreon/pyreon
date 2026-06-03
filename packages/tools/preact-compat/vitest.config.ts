import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  coverageThresholds: { statements: 95, lines: 94, branches: 95 },
})
