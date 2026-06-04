import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  environment: 'happy-dom',
  // PR 5/6 add JSX components (<Search>, <Sidebar>, <Toc>) — overlay,
  // keyboard handler, scroll-spy via IntersectionObserver. Coverage
  // needs the Chromium-backed browser test harness (a PR 7 follow-up).
  // Exclude until the spike adds the harness so the docs-pyreon
  // migration isn't blocked on coverage drift.
  coverageExclude: [
    'src/search/search-runtime.tsx',
    'src/components/Sidebar.tsx',
    'src/components/Toc.tsx',
  ],
  // PR 4 lifted statement coverage above the floor; branches sit at
  // ~92% (lifecycle error paths + overload alternatives).
  // BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts documents
  // the rationale + roadmap.
  coverageThresholds: {
    statements: 95,
    branches: 92,
    functions: 95,
    lines: 95,
  },
})
