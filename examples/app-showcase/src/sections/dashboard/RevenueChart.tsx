import { Chart } from '@pyreon/charts'
import { useQuery } from '@pyreon/query'
import { css, useCSS, useTheme } from '@pyreon/styler'
import type { Theme } from '@pyreon/ui-theme'
import { fetchRevenueByDay } from './data/api'
import type { Datum } from './data/types'
import { ChartCard, ChartFallback, ChartTitle } from './styled'

/**
 * The Chart component renders its own `<div>` with `ref={chart.ref}`.
 * To give that div a size we generate a class name from a styler `css`
 * fragment and pass it via `class={...}` — same pattern as a regular
 * styled component but without an extra wrapper div.
 */
const canvasCss = css`
  width: 100%;
  height: 220px;
`

/**
 * Revenue line chart for the last 14 days. Demonstrates @pyreon/charts:
 *   • `useQuery` fetches the time series async
 *   • `<Chart options={() => ...} />` lazy-loads the ECharts modules it
 *     needs, mounts a chart, and updates when the options function's
 *     signal dependencies change
 *   • The container's height is set on `ChartCanvas` so ECharts knows
 *     how big to render
 */
export function RevenueChart() {
  const canvasClass = useCSS(canvasCss)
  const theme = useTheme<Theme>()
  const query = useQuery<Datum[]>(() => ({
    queryKey: ['dashboard', 'revenue-by-day'],
    queryFn: fetchRevenueByDay,
  }))

  // Theme colors used by ECharts. Resolved once at component mount —
  // ECharts options are JSON config that doesn't accept styler
  // interpolations, so we read the theme synchronously here and pass
  // the resolved hex strings into the options object.
  const accent = theme.color.system.primary.base
  const gridLine = theme.color.system.base[200]
  const splitLine = theme.color.system.base[100]
  const axisInk = theme.color.system.dark[500]

  return (
    <ChartCard>
      <ChartTitle>Revenue (last 14 days)</ChartTitle>
      {() => {
        const data = query.data()
        if (!data) return <ChartFallback>Loading chart…</ChartFallback>
        return (
          <Chart
            class={canvasClass}
            options={() => ({
              tooltip: { trigger: 'axis' },
              grid: { top: 20, right: 16, bottom: 32, left: 48 },
              xAxis: {
                type: 'category',
                data: data.map(([day]) => day.slice(5)),
                axisLine: { lineStyle: { color: gridLine } },
                axisLabel: { color: axisInk, fontSize: 11 },
              },
              yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: gridLine } },
                splitLine: { lineStyle: { color: splitLine } },
                axisLabel: {
                  color: axisInk,
                  fontSize: 11,
                  formatter: (value: number) => `$${(value / 1000).toFixed(0)}K`,
                },
              },
              series: [
                {
                  name: 'Revenue',
                  type: 'line',
                  smooth: true,
                  symbolSize: 6,
                  lineStyle: { width: 2, color: accent },
                  itemStyle: { color: accent },
                  areaStyle: { color: theme.color.system.primary[100] },
                  data: data.map(([, value]) => value),
                },
              ],
            })}
          />
        )
      }}
    </ChartCard>
  )
}
