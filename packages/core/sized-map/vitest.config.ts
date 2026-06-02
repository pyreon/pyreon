import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure data-structure primitive. No DOM env needed.
// All logic lives in src/index.ts — include it in coverage measurement.
export default defineNodeConfig({
  category: 'internals',
  includeIndexInCoverage: true,
})
