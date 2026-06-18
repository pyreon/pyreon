import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 99, functions: 99, lines: 99 },
})
