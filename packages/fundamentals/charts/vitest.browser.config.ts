import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

export default defineBrowserConfig(playwright(), {
  // The browser suite MEASURES the files the node config excludes (its
  // `coverageExclude` says each is "fully exercised in real Chromium"). Until
  // batch 4 of the charts audit that claim was unmeasured, and measuring it
  // found hosts at 50-65%: each family spec proved its own geometry and click,
  // nobody drove the shared paths on every host. `host-sweep.browser.test.tsx`
  // now does, and this gate keeps the claim honest — the floors are the
  // measured values (2026-09-08: 88.7% statements / 73.9% branches / 94.4%
  // functions / 92.9% lines over these files) with a small margin, and they
  // ratchet UP, never down to absorb a regression.
  //
  // The list is the node config's exclusion list minus what the node run
  // covers on its own (`family-host.tsx` is plain routing over the hosts, at
  // 100% there). Keep the two lists in sync: a host excluded from node
  // coverage and absent here is measured NOWHERE.
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary'],
      include: [
        'src/engine/Chart.tsx',
        'src/engine/PieChart.tsx',
        'src/engine/HeatmapChart.tsx',
        'src/engine/CandlestickChart.tsx',
        'src/engine/RadarChart.tsx',
        'src/engine/canvas-web.ts',
        'src/engine/canvas-host.tsx',
        'src/engine/FunnelChart.tsx',
        'src/engine/TreemapChart.tsx',
        'src/engine/SunburstChart.tsx',
        'src/engine/TreeChart.tsx',
        'src/engine/SankeyChart.tsx',
        'src/engine/GraphChart.tsx',
        'src/engine/CalendarChart.tsx',
        'src/engine/ParallelChart.tsx',
        'src/engine/SingleAxisChart.tsx',
        'src/engine/PolarChart.tsx',
        'src/engine/RiverChart.tsx',
        'src/engine/BoxplotChart.tsx',
        'src/engine/GanttChart.tsx',
        'src/engine/MapChart.tsx',
      ],
      thresholds: { statements: 86, branches: 70, functions: 92, lines: 90 },
    },
  },
})
