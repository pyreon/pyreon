import { ChartThemeProvider, OptionChart, systemChartMode } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a donut from an ECharts option: an inner radius, labels outside
 * with leader lines, and a legend that toggles slices (click an entry). The
 * `shared` signal counts "Vary" presses.
 * The provider hands it the PAGE's scheme (`systemChartMode` reads the
 * root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
function make(): { name: string; value: number }[] {
  return ['Direct', 'Search', 'Email', 'Social', 'Referral'].map((name) => ({ name, value: 200 + Math.round(Math.random() * 900) }))
}

export default function GalleryDonut(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const data = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            data.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <ChartThemeProvider mode={systemChartMode()}>
        <OptionChart
          height={300}
          option={() => ({
            tooltip: { trigger: 'item' },
            legend: { bottom: 0 },
            series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '45%'], itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, data: data() }],
          })}
        />
      </ChartThemeProvider>
    </div>
  )
}
