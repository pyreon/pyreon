import { Axis, Bar, Chart, Tooltip } from '@pyreon/charts'
import { useQuery } from '@pyreon/query'
import { useTheme } from '@pyreon/styler'
import type { Theme } from '@pyreon/ui-theme'
import { fetchRevenueByCategory } from './data/api'
import type { Datum } from './data/types'
import { ChartCard, ChartFallback, ChartTitle } from './styled'

const thousands = (value: number): string => `$${(value / 1000).toFixed(0)}K`

/** Bar chart of revenue per category. */
export function CategoryChart() {
  const theme = useTheme<Theme>()
  const query = useQuery<Datum[]>(() => ({
    queryKey: ['dashboard', 'revenue-by-category'],
    queryFn: fetchRevenueByCategory,
  }))
  // Same theme-resolution pattern as RevenueChart.
  const chartTheme = {
    palette: [theme.color.system.primary.base],
    axis: theme.color.system.base[200],
    grid: theme.color.system.base[100],
    label: theme.color.system.dark[500],
  }

  return (
    <ChartCard>
      <ChartTitle>Revenue by category</ChartTitle>
      {() => {
        const data = query.data()
        if (!data) return <ChartFallback>Loading chart…</ChartFallback>
        return (
          <Chart<Datum> data={data} x={(d) => d[0]} height={220} theme={chartTheme}>
            <Bar<Datum> y={(d) => d[1]} label="Revenue" />
            <Axis y format={thousands} />
            <Tooltip />
          </Chart>
        )
      }}
    </ChartCard>
  )
}
