import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure types + trivial helper. No DOM env needed.
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
