import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Threshold history (post v8-ignore campaign cleanup):
  // - Pre-PR-1298 baseline: 91.15% branches (already strong)
  // - PR #1298 (cosmetic): 95.38% via 23 /* v8 ignore */ annotations across 9 files
  //   (gaming the gate by ignoring animation lifecycle defensive arms)
  // - Current: 91.15% branches via REMOVAL of the cosmetic ignores (no real-test
  //   regression — the baseline tests were always real)
  //
  // The remaining 40 uncov branches are optional-CSS-property arms and animation
  // lifecycle defensive guards (config.leaveStyle, config.enterTransition, ref
  // null-during-onEnd, etc.) reached only under very specific timing + config
  // permutations. The browser-side e2e tests at e2e/ui-showcase-regression.spec.ts
  // exercise these in real Chromium but vitest measures unit-test-process coverage
  // only. Raising threshold to 95 would require either v8-ignores (gaming) or
  // a combinatorial test matrix that doesn't scale to the maintenance cost.
  coverageThresholds: {
    statements: 95,
    branches: 91,
    functions: 95,
    lines: 95,
  },
})
