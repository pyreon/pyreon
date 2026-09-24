import { defineNodeConfig } from '@pyreon/vitest-config'

// All the plugin's logic lives in src/index.ts (828 lines). The default
// coverage-exclude list contains `src/**/index.ts`, so we opt in to
// keep it measured.
export default defineNodeConfig({
  category: 'tools',
  includeIndexInCoverage: true,
  coverageExclude: [
    // hmr-runtime.ts is a virtual-module body that runs in the user's
    // browser, not in Node. Excluded as integration-tier (real Vite +
    // browser session).
    'src/hmr-runtime.ts',
  ],
  // Re-baselined 95/88 → 94/87 (2026-07 coverage-gate restoration): measured
  // 94.58/87.84 on a local full run — the package was previously SKIPPED on
  // CI (120s per-package gate timeout on slower runners), so the drift went
  // unnoticed. Aspiration stays 95 — raise back as tests land
  // (BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts mirrors these).
  // Ratcheted 94/87/94/94 -> 95/90/94/95 by the 92%+ campaign (measured
  // 95.34 / 90.33 / 94.28 / 95.83). Below the 92 bar on branches, and the
  // residual is named rather than smoothed over.
  //
  // Four suites over surface that had none: the transform hook's early-exit
  // LADDER (each rung returns early, so a rung that fires when it should not
  // silently skips every transform below it — a missing island name means
  // the marker and the registry disagree and the island never hydrates); the
  // SSR compile-to-string capability gate, which the catalog records shipping
  // broken once already (default-on, it injected an import a strict install
  // cannot resolve and 500'd at request time); the balanced-args parser, the
  // "hand-rolled parser over escape contexts" class; and the auto-import
  // merge, the `_rp` collision class.
  //
  // What remains is ~69 arms, and the bulk of it is integration-tier: the
  // `configureServer` dev middleware (a real dev server) and the
  // rocketstyle-collapse resolver (which boots a NESTED Vite build). Those
  // are proven by the zero-hmr / ssr-showcase e2e rather than by the node
  // runner. Raise in lockstep; never lower.
  // Ratcheted 95/90 -> 96/92 (2026-09 coverage campaign). Measured 96.08
  // statements / 92.01 branches after suites covering the source-masking
  // scanner, the dev SSR handler, the LPIH cache write, dev cache
  // invalidation and the boot islands audit. Raise as tests land, never
  // lower to absorb a regression.
  coverageThresholds: {
    statements: 96,
    branches: 92,
    functions: 94,
    lines: 96,
  },
})
