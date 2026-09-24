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
  //
  // Ratcheted 88/76 -> 93/83 -> 97/92/99/97 by the 92%+ campaign (measured
  // 97.73 / 92.50 / 100 / 98.01). BOTH bars are now clear.
  //
  // The second half of the lift went after the doctor, which is the part of
  // this package that tells other people their project is healthy — so an
  // untested branch here is a wrong verdict about someone else's repo. What
  // landed: the three lockfile readers behind `check-dedup` (a parser that
  // silently reads nothing reports no duplicates, which is the state it
  // exists to catch); the report renderer's refusal to show a score for a run
  // that measured nothing; the `doc-claims` gate end to end, including the
  // three ways a stale count has actually shipped past it; the scan-surface
  // predicates that decide what gets audited at all; and the `--ci` exit code,
  // whose whole contract is which findings may block a merge.
  coverageThresholds: {
    statements: 97,
    branches: 92,
    functions: 99,
    lines: 97,
  },
})
