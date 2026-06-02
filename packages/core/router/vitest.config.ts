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
  coverageThresholds: {
    statements: 95,
    branches: 88,
    functions: 94,
    lines: 94,
  },
})
