import { area, currency, line, PlotChart, points, smooth } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a trend: an area under a smoothed line, its points (all three
 * labelled Revenue, so they share one colour and one legend entry), one currency
 * formatter feeding the axis, the tooltip and the accessible table together.
 * `data` is an accessor, so "Shuffle" repaints the same canvas in place.
 * The `shared` signal counts shuffles (bridgeable, not require-bridged).
 */
interface Row {
  month: string
  revenue: number
  target: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function make(): Row[] {
  let v = 1800
  return MONTHS.map((month, i) => {
    v = Math.max(600, v + (Math.random() - 0.4) * 700)
    return { month, revenue: Math.round(v), target: 1600 + i * 120 }
  })
}

export default function GalleryTrend(props: { shared?: Signal<number> }) {
  const shuffles = props.shared ?? signal(0)
  const rows = signal<Row[]>(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            rows.set(make())
            shuffles.update((n) => n + 1)
          }}
        >
          Shuffle
        </button>
        <span>shuffles: {() => shuffles()}</span>
      </div>
      <PlotChart<Row>
        data={() => rows()}
        x={(d) => d.month}
        marks={[
          area((d) => d.revenue, { curve: smooth, label: 'Revenue' }),
          line((d) => d.revenue, { curve: smooth, width: 2, label: 'Revenue' }),
          points((d) => d.revenue, { radius: 3, label: 'Revenue' }),
          line((d) => d.target, { width: 1, dash: [4, 4], label: 'Target' }),
        ]}
        format={currency('$')}
        title="Revenue against target"
        showLegend
        tooltip
        height={280}
      />
    </div>
  )
}
