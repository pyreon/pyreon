import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // ECharts mounts via canvas + real layout — exercised by
  // chart-component.browser.test.tsx and app-showcase e2e. Node-side
  // unit coverage skips it.
  coverageExclude: ['src/chart-component.tsx'],
  coverageThresholds: { statements: 94 },
})
