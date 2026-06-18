import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  // statements/functions/lines locked at 99; branches at 97 — the residual
  // branch tail is validator-internal edge cases (nested issue paths, the
  // parse-threw non-Error catch) + a few coverage-tooling-unlocatable arms.
  coverageThresholds: { statements: 99, branches: 97, functions: 99, lines: 99 },
})
