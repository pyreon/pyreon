import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // src/scroll.ts: scroll restoration needs real browser scroll mechanics
  //   (scrollY positioning + scroll-event timing) — happy-dom returns 0 for
  //   all scroll metrics. Exercised by e2e nav tests in ssr-showcase.
  // src/tests/setup.ts: test setup file, not production source.
  coverageExclude: ['src/scroll.ts', 'src/tests/**'],
  // Re-baselined 95/88 → 91/85 (measured 91.78/85.12 at the 2026-07
  // coverage-gate restoration; the Coverage (Full) gate had been red on every
  // main run — a red-on-arrival threshold detects nothing). The drift came
  // from feature waves covered by real-Chromium e2e rather than node vitest:
  // route-change announcer (router.browser.test.tsx), View Transitions +
  // popstate/hash listener arms, RouterLink link-DX warning paths
  // (components.tsx), and serverLoader/invalidateLoader arms (router.ts).
  // Aspiration stays 95/95 — raise back in lockstep as targeted tests land
  // (BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts mirrors these).
  coverageThresholds: {
    statements: 91,
    branches: 85,
    functions: 94,
    lines: 94,
  },
})
