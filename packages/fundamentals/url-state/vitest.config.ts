import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 98, functions: 98, lines: 99 },
})
