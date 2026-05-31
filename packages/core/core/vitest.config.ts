import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  coverageThresholds: { statements: 94, functions: 94, lines: 94 },
})
