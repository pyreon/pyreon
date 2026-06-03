import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure constants + small helpers, no DOM env needed.
// All logic lives in src/index.ts — include it in coverage measurement.
export default defineNodeConfig({
  category: 'internals',
  includeIndexInCoverage: true,
  // colorEnabled=true paths require real TTY or FORCE_COLOR=1 — wrapped
  // in /* v8 ignore */ regions; exercised by downstream lint-reporter
  // integration tests under real terminals.
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
