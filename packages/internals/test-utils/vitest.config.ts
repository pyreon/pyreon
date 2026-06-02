import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'internals',
  // happy-dom required by mountReactive / mountAndExpectOnce tests.
  // Existing non-DOM tests run fine in this environment too.
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 95, branches: 80, functions: 95, lines: 95 },
})
