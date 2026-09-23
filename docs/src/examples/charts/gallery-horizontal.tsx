import { ChartThemeProvider, OptionChart, systemChartMode } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — an ECharts option, pasted as-is: a horizontal bar ranking (a
 * category y axis over a value x axis). `OptionChart` compiles it onto Pyreon's
 * engine — no ECharts in the bundle — with ECharts' own geometry: rows run
 * bottom-up, as ECharts' category y axis does. "Re-rank" sorts ascending or
 * descending; the `shared` signal counts re-ranks.
 * The provider hands it the PAGE's scheme (`systemChartMode` reads the
 * root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
const LANGS = [
  { name: 'TypeScript', value: 38.5 },
  { name: 'Python', value: 51 },
  { name: 'Rust', value: 12.6 },
  { name: 'Go', value: 13.5 },
  { name: 'Kotlin', value: 9.4 },
  { name: 'Swift', value: 4.7 },
]

export default function GalleryHorizontal(props: { shared?: Signal<number> }) {
  const reranks = props.shared ?? signal(0)
  const ascending = signal(true)
  const sorted = () => [...LANGS].sort((a, b) => (ascending() ? a.value - b.value : b.value - a.value))
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            ascending.set(!ascending())
            reranks.update((n) => n + 1)
          }}
        >
          Re-rank
        </button>
        <span>re-ranks: {() => reranks()}</span>
      </div>
      <ChartThemeProvider mode={systemChartMode()}>
        <OptionChart
          height={280}
          option={() => ({
            title: { text: 'Language use (%)' },
            tooltip: { trigger: 'axis' },
            grid: { left: 90, right: 24, top: 40, bottom: 24 },
            xAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
            yAxis: { type: 'category', data: sorted().map((l) => l.name) },
            series: [{ type: 'bar', name: 'Share', data: sorted().map((l) => l.value), label: { show: true, position: 'right' }, itemStyle: { borderRadius: [0, 4, 4, 0] } }],
          })}
        />
      </ChartThemeProvider>
    </div>
  )
}
