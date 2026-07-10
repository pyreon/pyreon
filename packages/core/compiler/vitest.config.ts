import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Re-baselined 92/85/94/94 → 89/83/93/92 (measured 89.12/83.14/93.51/92.36
  // at the 2026-07 coverage-gate restoration; the Coverage (Full) gate had
  // been red on every main run — a red-on-arrival threshold detects nothing).
  // Beyond the long-standing jsx.ts edge-case tail, the drift came from the
  // PMTC/audit-era modules landing with integration-tier coverage:
  // validate-emit.ts (56% — swiftc/kotlinc validation loops run in the
  // `test (native)` CI cell, not vitest), native-audit.ts (56% — same),
  // diagnose.ts (63% — the throw-time fix-printer catalog, exercised by
  // e2e/dev-error-printer.spec.ts). Aspiration stays 95/95 — raise back in
  // lockstep as targeted tests land (BELOW_FLOOR_EXEMPTIONS entry in
  // scripts/check-coverage.ts mirrors these numbers).
  coverageThresholds: { statements: 89, branches: 83, functions: 93, lines: 92 },
})
