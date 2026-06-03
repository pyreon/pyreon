import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  // Threshold history (post v8-ignore campaign cleanup):
  // - Pre-PR-1301 baseline: 85.31% branches
  // - PR #1301 (cosmetic): 100% via 24 /* v8 ignore */ annotations (gaming)
  // - Current: 89.51% branches via 20 REAL tests in branch-coverage-real.test.ts
  //   (safeNotEqual NaN/object/function arms, component-context subscribe +
  //   re-render hooks, onMount/onDestroy re-push paths, custom event
  //   dispatcher, derived multi/single source, readable facade, mount smoke).
  //   +4.2pp over pre-cosmetic baseline.
  //
  // The remaining ~14 uncov branches are defensive code in wrapCompatComponent
  // (effect runners + scheduleEffects deferred unmounted check, cached props
  // fallback) reached only through specific real-app multi-render scenarios.
  // Real-Chromium e2e at e2e/compat-layers exercises these but vitest measures
  // unit-test process coverage only.
  coverageThresholds: {
    statements: 95,
    lines: 94,
    branches: 89,
    functions: 90,
  },
})
