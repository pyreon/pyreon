import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  coverageThresholds: { statements: 95, lines: 94 },
})
