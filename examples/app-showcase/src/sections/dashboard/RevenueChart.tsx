import { Area, Axis, Chart, Tooltip, smooth } from '@pyreon/charts'
import { useQuery } from '@pyreon/query'
import { useTheme } from '@pyreon/styler'
import type { Theme } from '@pyreon/ui-theme'
import { fetchRevenueByDay } from './data/api'
import type { Datum } from './data/types'
import { ChartCard, ChartFallback, ChartTitle } from './styled'

const thousands = (value: number): string => `$${(value / 1000).toFixed(0)}K`

/**
 * Revenue for the last 14 days. Demonstrates @pyreon/charts:
 *   • `useQuery` fetches the time series async
 *   • `<Chart>` takes the rows and an `<Area>` mark as a child; the axis,
 *     tooltip and accessible data table come with it
 *   • The chart's colours come from the app theme, read once at mount
 */
export function RevenueChart() {
  const theme = useTheme<Theme>()
  const query = useQuery<Datum[]>(() => ({
    queryKey: ['dashboard', 'revenue-by-day'],
    queryFn: fetchRevenueByDay,
  }))
  const chartTheme = {
    palette: [theme.color.system.primary.base],
    axis: theme.color.system.base[200],
    grid: theme.color.system.base[100],
    label: theme.color.system.dark[500],
  }

  return (
    <ChartCard>
      <ChartTitle>Revenue (last 14 days)</ChartTitle>
      {() => {
        const data = query.data()
        if (!data) return <ChartFallback>Loading chart…</ChartFallback>
        return (
          <Chart<Datum> data={data} x={(d) => d[0].slice(5)} height={220} theme={chartTheme}>
            <Area<Datum> y={(d) => d[1]} label="Revenue" curve={smooth} />
            <Axis y format={thousands} />
            <Tooltip />
          </Chart>
        )
      }}
    </ChartCard>
  )
}
