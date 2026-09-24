import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  // Logic in src/index.ts (zero's main re-export + setup). Keep measured.
  includeIndexInCoverage: true,
  // Integration-tier: Vite build-time plugins, server-runtime
  // infrastructure, and JSX-component browser surfaces. These
  // run in real Vite builds / real Node servers / real browser
  // sessions and are exercised by example apps and end-to-end
  // tests, not by Node-side vitest. PR #323 finding.
  coverageExclude: [
    // Build-time / Vite plugins:
    'src/vite-plugin.ts',
    'src/ssg-plugin.ts',
    'src/ssr-plugin.ts',
    'src/ssr-build-shared.ts',
    'src/app.ts',
    'src/favicon.ts',
    'src/font.ts',
    'src/icons-plugin.ts',
    'src/image-plugin.ts',
    'src/og-image.ts',
    // Server-runtime middleware / SSR entry:
    'src/entry-server.ts',
    'src/cache.ts',
    'src/compression.ts',
    'src/isr.ts',
    'src/i18n-routing.ts',
    'src/ai.ts',
    'src/actions.ts',
    'src/logger.ts',
    'src/seo.ts',
    // JSX components (browser-tested):
    'src/link.tsx',
    'src/image.tsx',
    'src/script.tsx',
    // Browser-only utility:
    'src/utils/intersection-observer.ts',
    'src/utils/use-intersection-observer.ts',
    'src/theme.tsx', // JSX components — browser-tested integration tier
    'src/client.ts', // browser-runtime entry; tested via real-Chromium e2e
    'src/fs-router.ts', // file-system router — exercised by integration fixtures
    // Integration-test fixtures — these are sample apps the integration
    // tests boot, not production source. They count as 0% in coverage
    // because the tests don't import them directly; vite picks them up
    // at run time.
    'src/tests/**',
    'src/index.ts', // zero's main re-export; covered by transitive use, not direct import
    'src/_404.ts',
    'src/_layout.tsx',
    'src/routes/**',
  ],
  // Ratcheted 94/85 → 96/92 (2026-09 coverage campaign). Measured 96.78
  // statements / 92.23 branches after suites covering hreflang generation,
  // the dev-server locale redirect, adapter `_routes.json` + `revalidate`,
  // certificate-cache renewal, the perf-advisor manifest walk, CORS origin
  // resolution and RSS output. Statements now clear the 95 floor outright;
  // branches keep an exemption. Raise as tests land, never lower to absorb
  // a regression (BELOW_FLOOR_EXEMPTIONS in scripts/check-coverage.ts
  // mirrors these and the drift check requires they match exactly).
  coverageThresholds: {
    statements: 96,
    branches: 92,
    functions: 95,
    lines: 95,
  },
})
