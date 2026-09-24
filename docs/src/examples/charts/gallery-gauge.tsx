import { ChartThemeProvider, systemChartMode } from '@pyreon/charts'
import { OptionChart } from '@pyreon/charts/option'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a gauge whose value is a signal: the option is an accessor, so a
 * write repaints the dial. The `shared` signal counts nudges.
 * The provider hands it the PAGE's scheme (`systemChartMode` reads the
 * root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
export default function GalleryGauge(props: { shared?: Signal<number> }) {
  const nudges = props.shared ?? signal(0)
  const load = signal(64)
  const nudge = (d: number) => {
    load.set(Math.max(0, Math.min(100, load() + d)))
    nudges.update((n) => n + 1)
  }
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={() => nudge(-10)}>
          −10
        </button>
        <button type="button" onClick={() => nudge(10)}>
          +10
        </button>
        <span>nudges: {() => nudges()}</span>
      </div>
      <ChartThemeProvider mode={systemChartMode()}>
        <OptionChart
          height={300}
          option={() => ({
            series: [{ type: 'gauge', progress: { show: true, width: 14 }, axisLine: { lineStyle: { width: 14 } }, detail: { formatter: '{value}%' }, data: [{ value: load(), name: 'CPU' }] }],
          })}
        />
      </ChartThemeProvider>
    </div>
  )
}
