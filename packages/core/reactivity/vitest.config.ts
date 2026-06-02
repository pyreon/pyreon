import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // Statements 94 (current 96.13%) / lines 94 (current 98.15%) / functions 100% — all
  // above the 90 floor and the cov-94 series. Branches set to 88 (current 88.03%)
  // because `notifySubscribers`'s non-batching paths (lines 81, 95-100 of tracking.ts)
  // are effectively unreachable from the public API — `signal.set` always auto-wraps
  // in batch(), so the non-batching branches in `notifySubscribers` only fire from
  // internal call sites that aren't worth the test-maintenance cost of synthesising.
  // PR #1199 lifted from 87.07% by adding computed-direct + batch MAX_PASSES tests
  // (computed.ts 87.09 → 98.7 statements, 78.37 → 87.83 branches).
  coverageThresholds: { statements: 95, lines: 94, branches: 88 },
})
