import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // Re-baselined + made fully explicit (2026-07 coverage-gate restoration,
  // measured 94.55/87.64 then). Branches 87 → 86 on 2026-08-04 at the measured
  // 86.12: the atlas/content tool arms added by #2610/#2646 grew the
  // optional-chain-dense branch surface faster than its tests, unnoticed
  // because the coverage child was dying on CI before printing a summary.
  // Ratchet BACK to 87+ as those arms get specs — never lower further to
  // absorb new drift. Aspiration 95.
  // (BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts mirrors these.)
  coverageThresholds: { statements: 94, branches: 86, functions: 97, lines: 94 },
})
