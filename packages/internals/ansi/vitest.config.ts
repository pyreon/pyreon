import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure constants + small helpers, no DOM env needed.
// All logic lives in src/index.ts — include it in coverage measurement.
export default defineNodeConfig({
  category: 'internals',
  includeIndexInCoverage: true,
  // hyperlink's colorEnabled=true path requires a TTY; isColorEnabled's
  // env-var branches captured at module load (NO_COLOR / FORCE_COLOR) —
  // both are v8-ignored inline. Branches lowered to reflect.
  // branches: colorEnabled=true ternary paths need real TTY or
  // FORCE_COLOR=1 — exercised by lint-reporter integration tests.
  coverageThresholds: { statements: 95, branches: 65, functions: 95, lines: 95 },
})
