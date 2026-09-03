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
    // Covered by heatmap.browser.test.tsx / candlestick.browser.test.tsx
    // (real Chromium) — a canvas host has nothing meaningful to assert
    // without a real 2d context.
    'src/engine/HeatmapChart.tsx',
    'src/engine/CandlestickChart.tsx',
    // Covered by radar-chart.browser.test.tsx (real Chromium) — same canvas-host
    // rationale; radial-host.ts is the width-measure/ResizeObserver seam those
    // components exercise, meaningless without a real layout engine.
    'src/engine/RadarChart.tsx',
    'src/engine/radial-host.ts',
    'src/engine/canvas-web.ts',
    // The family canvas hosts — each is covered ONLY by its real-Chromium
    // *.browser.test.tsx (funnel / treemap / sunburst / tree / sankey / graph /
    // calendar / parallel / polar / river), which paints and hit-tests a live
    // 2d context; the node run cannot reach them, so they read 0% here.
    'src/engine/FunnelChart.tsx',
    'src/engine/TreemapChart.tsx',
    'src/engine/SunburstChart.tsx',
    'src/engine/TreeChart.tsx',
    'src/engine/SankeyChart.tsx',
    'src/engine/GraphChart.tsx',
    'src/engine/CalendarChart.tsx',
    'src/engine/ParallelChart.tsx',
    'src/engine/PolarChart.tsx',
    'src/engine/RiverChart.tsx',
    // Same class — canvas hosts covered only by their real-Chromium suites (boxplot.browser.test.tsx).
    'src/engine/BoxplotChart.tsx',
    // Same class — canvas hosts covered only by their real-Chromium suites (geo.browser.test.tsx).
    // Same class — canvas hosts covered only by their real-Chromium suites (gantt.browser.test.tsx, geo.browser.test.tsx).
    'src/engine/GanttChart.tsx',
    'src/engine/MapChart.tsx',
  ],
  // loader.ts + vite.ts (the node-instrumented surface) are at 100% on all
  // four metrics after the error/retry/no-tslib path tests. Threshold set to
  // 98 to lock the floor with a small headroom against incidental drift.
  // Re-baselined for the plot-engine family wave (2026-09): each family PR
  // lands geometry with statement-level specs and the interaction/edge specs
  // arrive in later PRs of the same stack, so a single branch measures
  // 94-97% statements and 85-90% branches. Recorded in check-coverage.ts's
  // BELOW_FLOOR_EXEMPTIONS at these values; ratchet back toward 98 once the
  // wave has merged (never lower to absorb a regression).
  coverageThresholds: {
    statements: 94,
    branches: 85,
    functions: 90,
    lines: 94,
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
