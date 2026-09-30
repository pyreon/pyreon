import { PolarChart, type PolarSeries } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a polar chart: bars around the angle axis with a line over them.
 * "Vary" regenerates both series.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function make(): PolarSeries[] {
  const rain = MONTHS.map((_, i) => Math.round(40 + 30 * Math.cos((i - 1) / 1.9) + Math.random() * 15))
  return [
    { name: 'Rainfall', kind: 'bar', values: rain },
    { name: 'Average', kind: 'line', values: rain.map((v) => Math.round(v * 0.8 + 8)) },
  ]
}

export default function GalleryPolar(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const series = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            series.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <PolarChart axes={{ categories: MONTHS }} series={() => series()} title="Rainfall (mm)" height={320} />
    </div>
  )
}
