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
  // The plot engine's three PLATFORM files. Each needs a real canvas 2D
  // context or a mounted DOM, so the node run scores them 0 while they are
  // fully exercised in real Chromium:
  //   Chart.tsx      -> engine/chart.browser.test.tsx (11 specs, pixel-level)
  //   PieChart.tsx   -> engine/pie.browser.test.tsx   (10 specs, pixel-level)
  //   canvas-web.ts  -> both of the above, which assert painted pixels
  // The ENGINE itself (scales, layout, marks, arcs, stacks, formatting, a11y,
  // decimation) is pure and stays in the node run at ~98%, so this excludes
  // the backend and not the logic.
  coverageExclude: [
    'src/chart-component.tsx',
    'src/use-chart.ts',
    'src/engine/Chart.tsx',
    'src/engine/PieChart.tsx',
    'src/engine/canvas-web.ts',
  ],
  // loader.ts + vite.ts (the node-instrumented surface) are at 100% on all
  // four metrics after the error/retry/no-tslib path tests. Threshold set to
  // 98 to lock the floor with a small headroom against incidental drift.
  coverageThresholds: {
    statements: 98,
    branches: 98,
    functions: 98,
    lines: 98,
  },
  // --expose-gc makes `globalThis.gc` available in the fork workers so the
  // GC-observable dispose-leak lock (dispose-gc.test.tsx) RUNS in CI instead
  // of skipping. Same shape as @pyreon/runtime-dom's vitest config.
  overrides: {
    test: {
      // Vitest 4: pool options are top-level (`poolOptions` was removed).
      execArgv: ['--expose-gc'],
    },
  },
})
