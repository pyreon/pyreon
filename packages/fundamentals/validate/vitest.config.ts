import { defineNodeConfig } from '@pyreon/vitest-config'

/**
 * Coverage thresholds set to 80/75/80 (vs the 90/85/90 fundamentals
 * default) for v1: a few `Op` kinds are declared in `core/ops.ts` for
 * deferred checks (`toLowerCase`, `toUpperCase`, `trim`) whose chainable
 * methods land in PR #3 alongside `tuple` / `record` / `union` /
 * `discriminate` etc. The `pipe` function-comp helper is exported but
 * v1 ships method chaining as the primary surface — its tests live in
 * PR #3 too. Registered as a temporary BELOW_FLOOR_EXEMPTIONS entry
 * in `scripts/check-coverage.ts` — removed in the same PR that closes
 * the surface gap and bumps thresholds back to floor.
 */
export default defineNodeConfig({
  category: 'fundamentals',
  coverageThresholds: {
    statements: 80,
    branches: 75,
    functions: 80,
  },
})
