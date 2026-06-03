import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  // Threshold history (post v8-ignore campaign cleanup):
  // - Pre-PR-1300 honest baseline: 88.21% branches (verified by removing all
  //   v8-ignores and re-running)
  // - PR #1300 cosmetically lifted to 95.33% by adding 19 /* v8 ignore */
  //   annotations (later identified as gaming the gate, not real coverage)
  // - Current: 89.56% branches via 35 REAL tests in branch-coverage-real.test.ts
  //   covering createEffect undefined-return, mergeProps/splitProps descriptor
  //   paths, useContext native-context branch, createStore single-fn form,
  //   createResource stale-discard, filter-predicate setStore, DANGEROUS_KEYS
  //   protection. Beats pre-cosmetic baseline by +1.35pp honestly.
  //
  // The remaining ~17 uncov branches are defensive guards reachable only
  // through internals (proxy ownKeys/getOwnPropertyDescriptor combinatorial
  // arms, deep applyAtPath with empty path × non-fn value, stale-rejection
  // signal-eviction sweep). Reaching 95% would require refactoring out the
  // genuinely-dead defensive arms — a separate cleanup PR.
  coverageThresholds: {
    statements: 95,
    lines: 95,
    branches: 89,
    functions: 95,
  },
})
