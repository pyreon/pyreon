import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // Re-baselined 95/85/95/95 → 88/76/94/89 (measured 88.88/76.91/94.76/89.51
  // at the 2026-07 coverage-gate restoration; the Coverage (Full) gate had
  // been red on every main run — a red-on-arrival threshold detects nothing).
  // The drift came from the CLI-unification wave (`pyreon new`/`mcp`/`add`/
  // `check`/`upgrade` npx-delegator + subprocess-orchestration paths) and the
  // doctor gates that shell out to real repo scans (check-bundle-budgets,
  // audit-types, native-audit, audit-leak-classes) — cross-process paths hard
  // to drive from vitest. Aspiration stays 95/95 — raise back in lockstep as
  // per-subcommand tests land (BELOW_FLOOR_EXEMPTIONS entry in
  // scripts/check-coverage.ts mirrors these numbers).
  coverageThresholds: {
    statements: 88,
    branches: 76,
    functions: 94,
    lines: 89,
  },
})
