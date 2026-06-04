import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Functions + lines are at 97.87% / 96.22%. Statements at 92.65% — gap is
  // in jsx.ts (~3000-statement file with scattered compiler-edge-case
  // branches needing a dedicated test corpus). Statements sit below
  // MINIMUM_FLOOR (95); explicit BELOW_FLOOR_EXEMPTIONS entry in
  // scripts/check-coverage.ts tracks the gap with reason. Lifting to 95%
  // statements is multi-PR work.
  //
  // Branches lifted to 85.34% (was 84.63%) by branch-coverage-real.test.ts
  // covering reactivity-lens knownSignals + footgun code badge, lpih
  // same-line aggregation (rate1s + lastFire + kind nullish arms), and
  // test-audit formatter risk/singular/plural arms. Branches now clear
  // MINIMUM_BRANCH_FLOOR=85.
  coverageThresholds: { statements: 92, branches: 85, functions: 94, lines: 94 },
})
