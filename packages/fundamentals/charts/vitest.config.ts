import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // ECharts mounts via canvas + real layout — exercised by
  // chart-component.browser.test.tsx and app-showcase e2e. Node-side
  // unit coverage skips it.
  // use-chart.ts: ResizeObserver callback (line 97 chart.resize) +
  // init/setOption error paths require real Chromium — covered by
  // charts.browser.test.tsx in real-Chromium @vitest/browser.
  coverageExclude: ['src/chart-component.tsx', 'src/use-chart.ts'],
  coverageThresholds: { statements: 95 },
})
