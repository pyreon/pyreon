import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
  // toaster.tsx is the render layer — exercised by the real-Chromium
  // `toaster.browser.test.tsx` (run via `bun run test:browser`), not the
  // node/happy-dom store suite. Browser coverage isn't aggregated into the
  // node threshold, so excluding it here keeps the node gate honest.
  coverageExclude: ['src/toaster.tsx'],
})
