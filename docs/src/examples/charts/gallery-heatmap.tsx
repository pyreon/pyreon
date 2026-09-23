import { ChartThemeProvider, OptionChart, systemChartMode } from '@pyreon/charts/plot'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a heatmap from an ECharts option: activity by weekday and hour,
 * coloured through a continuous `visualMap` strip.
 * The provider hands it the PAGE's scheme (`systemChartMode` reads the
 * root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}h`)
const CELLS: number[][] = []
for (let d = 0; d < DAYS.length; d++) {
  for (let h = 0; h < 24; h++) {
    const work = d < 5 && h >= 9 && h <= 17 ? 6 : 1
    CELLS.push([h, d, Math.round(work + 4 * Math.abs(Math.sin((h + d * 3) / 4)))])
  }
}

export default function GalleryHeatmap(_props: { shared?: Signal<number> }) {
  return (
    <ChartThemeProvider mode={systemChartMode()}>
      <OptionChart
        height={300}
        option={{
          tooltip: {},
          grid: { left: 48, right: 16, top: 16, bottom: 70 },
          xAxis: { type: 'category', data: HOURS, splitArea: { show: true } },
          yAxis: { type: 'category', data: DAYS, splitArea: { show: true } },
          visualMap: { min: 0, max: 10, calculable: true, orient: 'horizontal', left: 'center', bottom: 0 },
          series: [{ type: 'heatmap', data: CELLS }],
        }}
      />
    </ChartThemeProvider>
  )
}
