import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
})
