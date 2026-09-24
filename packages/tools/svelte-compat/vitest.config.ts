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
  //
  // Ratcheted 95/94/89/90 -> 98/98/92/94 by the 92%+ campaign (measured
  // 98.89 / 98.53 / 92.30 / 94.44) — branches now clear the repo-wide bar.
  // Two contracts got it there: the unmount guard inside `scheduleEffects`
  // (a component can go away before its deferred effects run, and an effect
  // that runs anyway leaks silently), and the CHILDLESS shape of the
  // hardcoded native-component bypass — `<Show when={x} fallback={y} />`
  // with the content passed as a prop, which nothing exercised.
  coverageThresholds: {
    statements: 98,
    lines: 98,
    branches: 92,
    functions: 94,
  },
})
