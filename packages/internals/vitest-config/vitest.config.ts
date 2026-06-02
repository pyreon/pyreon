import { defineNodeConfig } from './src/node.ts'

// Dogfooding — this package's own tests use the helper it ships.
// Internals category → 95/77 coverage thresholds (measured 96.92% /
// 77.77% — uncovered branches are CATEGORY_DEFAULTS env-guards that
// run only when consumer overrides apply).
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 95, branches: 77, functions: 85, lines: 95 },
})
