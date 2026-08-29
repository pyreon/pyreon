import { PlotChart, bars, line } from '@pyreon/charts/plot'
import { useQuery } from '@pyreon/query'
import { fetchRevenueByDay } from './data/api'
import type { Datum } from './data/types'
import { ChartCard, ChartFallback, ChartTitle } from './styled'

/**
 * The same data as `<RevenueChart>`, drawn by Pyreon's OWN engine
 * (`@pyreon/charts/plot`) instead of the ECharts bridge.
 *
 * This exists to exercise the engine through the REAL `@pyreon/vite-plugin`
 * compiler in a real app. The engine's own suite runs under vitest's JSX
 * transform, which is not the transform that ships — the repeated lesson in
 * this repo is that a package's browser tests can be green while the real
 * compiler produces different (and broken) output for the same source.
 *
 * It also puts the two engines side by side on one page, which is the honest
 * way to compare them.
 */
export function OrdersPlotChart() {
  const query = useQuery<Datum[]>(() => ({
    queryKey: ['dashboard', 'revenue-by-day'],
    queryFn: fetchRevenueByDay,
  }))

  return (
    <ChartCard>
      <ChartTitle>Revenue — Pyreon plot engine</ChartTitle>
      {() => {
        const data = query.data()
        if (!data) return <ChartFallback>Loading chart…</ChartFallback>
        // A 7-day tail: the point is to prove the engine draws in a real app,
        // and a shorter series keeps the bars wide enough to hit-test.
        const rows = data.slice(-7)
        return (
          <div data-testid="plot-engine-chart">
            <PlotChart
              data={() => rows}
              x={(d: Datum) => d[0].slice(5)}
              marks={[bars((d: Datum) => d[1]), line((d: Datum) => d[1])]}
              height={220}
              showLegend
              title="Revenue, last 7 days"
            />
          </div>
        )
      }}
    </ChartCard>
  )
}
