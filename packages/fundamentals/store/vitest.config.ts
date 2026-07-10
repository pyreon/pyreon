import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The store's ENTIRE implementation lives in src/index.ts — without this
  // flag the default `src/**/index.ts` coverage exclude (meant for re-export
  // barrels) measured only registry/hydration/devtools (~42 statements) and
  // the 98% thresholds were vacuous for the core module.
  includeIndexInCoverage: true,
  // statements/functions/lines are at 100%. Branches sit at ~92%: the
  // residual uncovered arms are exclusively the PRODUCTION side of
  // `process.env.NODE_ENV !== 'production'` dev gates (structurally
  // uncoverable under vitest, which always runs in dev — the prod side is
  // locked at the bundle level by dev-gate-treeshake.test.ts).
  coverageThresholds: { statements: 100, branches: 92, functions: 100, lines: 100 },
})
