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
  // Ratcheted 88/76/94/89 -> 93/83/97/94 by the 92%+ campaign (measured
  // 93.13 / 83.39 / 97.98 / 94.55). Statements clear 92; branches do not, and
  // that is stated rather than smoothed over. Four suites over surface that
  // had none or half: the five npx delegators as a FAMILY (they were each
  // ~50%, with the half that actually spawns untested — including the exit
  // code CI reads), `upgrade`'s reporting layer (whose `--json` branch has
  // its OWN writeFileSync), `check`'s ordering + `--fix` re-detect, and
  // `plain`'s declined histogram, which CLAUDE.md calls "the build-next
  // signal" and whose ORDER nothing asserted.
  coverageThresholds: {
    statements: 93,
    branches: 83,
    functions: 97,
    lines: 94,
  },
})
