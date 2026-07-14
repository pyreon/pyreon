import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // useFocusTrap.browser.test.tsx runs in real Chromium via
  // `bun run test:browser` — exclude it from the node/happy-dom runner.
  excludeBrowserTests: true,
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
})
