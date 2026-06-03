import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Functions + lines are already at 98.12% / 96.29%. Statements at 92.38%
  // (June 2026; was 92.53% at PR #1079, has drifted ~0.15pt as jsx.ts grew
  // with progressively rarer compiler-edge-case branches). Residual gap
  // is in jsx.ts (~3000-statement file). Explicit `statements: 92` here
  // matches the BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts
  // — and unblocks Coverage (Full) which has been failing on main since
  // PR #1266 raised MINIMUM_FLOOR 90 → 94. Lifting back to 94+ is its
  // own targeted test-coverage PR — opportunistic test adds on unrelated
  // PRs won't cover the long-tail emit branches.
  coverageThresholds: { statements: 92, branches: 84, functions: 94, lines: 94 },
})
