import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  coverageThresholds: { statements: 94, lines: 94 },
})
