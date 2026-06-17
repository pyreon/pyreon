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
  // loader.ts + vite.ts (the node-instrumented surface) are at 100% on all
  // four metrics after the error/retry/no-tslib path tests. Threshold set to
  // 98 to lock the floor with a small headroom against incidental drift.
  coverageThresholds: {
    statements: 98,
    branches: 98,
    functions: 98,
    lines: 98,
  },
})
