import { Chart } from '@pyreon/charts'
import { useQuery } from '@pyreon/query'
import { css, useCSS, useTheme } from '@pyreon/styler'
import type { Theme } from '@pyreon/ui-theme'
import { fetchRevenueByCategory } from './data/api'
import type { Datum } from './data/types'
import { ChartCard, ChartFallback, ChartTitle } from './styled'

const canvasCss = css`
  width: 100%;
  height: 220px;
`

/** Bar chart of revenue per category. */
export function CategoryChart() {
  const canvasClass = useCSS(canvasCss)
  const theme = useTheme<Theme>()
  const query = useQuery<Datum[]>(() => ({
    queryKey: ['dashboard', 'revenue-by-category'],
    queryFn: fetchRevenueByCategory,
  }))

  // Same theme-resolution pattern as RevenueChart — colors flow from
  // the Pyreon theme into the ECharts JSON options.
  const accent = theme.color.system.primary.base
  const gridLine = theme.color.system.base[200]
  const splitLine = theme.color.system.base[100]
  const axisInk = theme.color.system.dark[500]

  return (
    <ChartCard>
      <ChartTitle>Revenue by category</ChartTitle>
      {() => {
        const data = query.data()
        if (!data) return <ChartFallback>Loading chart…</ChartFallback>
        return (
          <Chart
            class={canvasClass}
            options={() => ({
              tooltip: { trigger: 'axis' },
              grid: { top: 20, right: 16, bottom: 32, left: 60 },
              xAxis: {
                type: 'category',
                data: data.map(([cat]) => cat),
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
                  type: 'bar',
                  itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] },
                  barWidth: '40%',
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
