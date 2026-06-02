import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
