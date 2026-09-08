import { PlotChart, bars, line } from '@pyreon/charts/plot'
import { useQuery } from '@pyreon/query'
import { Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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

  // The last pick, rendered beside the chart so the real-app e2e can read what
  // a click / an Enter on the keyboard reported (the interaction leg of the
  // charts gate — the hosts' own browser suites run under vitest's JSX
  // transform, this page under the shipped compiler).
  const picked = signal(-1)
  // A 7-day tail: the point is to prove the engine draws in a real app, and a
  // shorter series keeps the bars wide enough to hit-test. Read INSIDE the
  // chart's own `data` accessor rather than in a conditional around the
  // chart: a refetch (window focus, an invalidation) then updates the same
  // host in place — tweened — instead of remounting it, which is what tore
  // the tooltip down under a real pointer before.
  const rows = (): Datum[] => (query.data() ?? []).slice(-7)
  return (
    <ChartCard>
      <ChartTitle>Revenue — Pyreon plot engine</ChartTitle>
      <span data-testid="plot-engine-picked">{() => String(picked())}</span>
      <Show when={() => query.data() !== undefined} fallback={<ChartFallback>Loading chart…</ChartFallback>}>
        <div data-testid="plot-engine-chart">
          <PlotChart
            data={rows}
            x={(d: Datum) => d[0].slice(5)}
            marks={[bars((d: Datum) => d[1]), line((d: Datum) => d[1])]}
            height={220}
            showLegend
            tooltip
            crosshair
            title="Revenue, last 7 days"
            onSelect={(i) => picked.set(i)}
          />
        </div>
      </Show>
    </ChartCard>
  )
}
