import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The real-Chromium suite runs under `test:browser`, not here.
  excludeBrowserTests: true,
  // Explicit, and above the 95 floor `scripts/check-coverage.ts` enforces.
  // The `fundamentals` category default is 85/80 — BELOW that floor, so
  // inheriting it would need a visible-debt exemption entry instead.
  // Ratchet these UP as coverage improves; never down to absorb a drop.
  coverageThresholds: { statements: 98, branches: 95, functions: 98, lines: 98 },
})
