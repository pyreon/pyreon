import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Functions + lines are at 97.87% / 96.25%. Statements at 92.38% — gap is
  // in jsx.ts (~3000-statement file with scattered compiler-edge-case
  // branches needing a dedicated test corpus). Statements/branches sit
  // below MINIMUM_FLOOR (95) / MINIMUM_BRANCH_FLOOR (85); explicit
  // BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts tracks the
  // gap with reason. Lifting to 95% is multi-PR work.
  coverageThresholds: { statements: 92, branches: 84, functions: 94, lines: 94 },
})
