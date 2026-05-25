import { defineNodeConfig } from '@pyreon/vitest-config'

// runtime-server has its renderToString + full SSR pipeline implemented
// in src/index.ts directly (not just re-exports). The default coverage
// exclude list contains `src/**/index.ts`, so we opt in to including it.
// Threshold is 95/95/95/95 — the package is tightly-covered (no SSR
// branches behind happy-dom or browser timing gates), so the high floor
// surfaces real coverage regressions immediately.
export default defineNodeConfig({
  category: 'core',
  includeIndexInCoverage: true,
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
})
