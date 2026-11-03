import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  environment: 'happy-dom',
  // JSX components (<Search>, <Sidebar>, <Toc>) — overlay, keyboard
  // handler, scroll-spy via IntersectionObserver — are covered by the
  // Chromium-backed browser tests (vitest.browser.config.ts), not by
  // node vitest, so they are excluded from node coverage.
  coverageExclude: [
    'src/search/search-runtime.tsx',
    'src/components/Sidebar.tsx',
    'src/components/Toc.tsx',
  ],
  // The 2026-06 docs cutover (PRs #1448 + #1491) landed the <Example>
  // migration + Pyreon-native docs pipeline with substantial new
  // integration-tier surface — plugin.ts's dev-server search middleware
  // (`configureServer`), build-mode search-index emission (`closeBundle`),
  // and optional-dependency dynamic imports (katex / mermaid success
  // paths) — none reachable from node vitest. Those paths are exercised
  // by the real docs build (docs/ runs this pipeline), verify-modes, and
  // the Chromium harness (vitest.browser.config.ts). Thresholds below
  // reflect ACHIEVED node-coverage (87.39/80.79/90.85/89.1 at true-up)
  // minus ~1pp run-to-run variance margin; the BELOW_FLOOR_EXEMPTIONS
  // entry in scripts/check-coverage.ts carries the same rationale and
  // drift-detects against these values. Lifting back to 95 is tracked
  // docs-pipeline work — raise these in lockstep as tests land.
  // Ratcheted 86/79 -> 96/92 (2026-09 coverage campaign). Measured 96.56
  // statements / 92.17 branches. The comment above records the dev-server
  // middleware and build-mode emission as unreachable from node vitest —
  // they are not: a Vite plugin hook is a function on an object, and both
  // are now driven directly (`_dev-search-middleware`,
  // `_build-index-pipeline`, `_compile-cache-and-scan`). What genuinely
  // stays out of reach is the optional-peer success path — katex and
  // mermaid are imported through a specifier assembled at RUNTIME so no
  // bundler resolves it, which also puts it beyond `vi.doMock`.
  coverageThresholds: {
    statements: 96,
    branches: 92,
    functions: 89,
    lines: 96,
  },
})
