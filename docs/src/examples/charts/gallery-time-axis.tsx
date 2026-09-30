import { Axis, Chart, Line, Tooltip, date } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a time axis: `xValue` places each point at its epoch-ms
 * timestamp, and `<Axis x time>` picks calendar-step ticks, labelled through
 * `date('MMM YYYY')`. The samples are unevenly spaced; the spacing on screen
 * follows the dates. "Vary" regenerates the values.
 */
interface Sample {
  at: number
  price: number
}

const DAY = 86_400_000
const START = Date.UTC(2025, 0, 1)
const OFFSETS = [0, 12, 40, 55, 90, 130, 150, 200, 240, 260, 300, 330, 364]

function make(): Sample[] {
  let price = 100
  return OFFSETS.map((d) => {
    price = Math.max(40, price + (Math.random() - 0.45) * 18)
    return { at: START + d * DAY, price: Math.round(price * 10) / 10 }
  })
}

export default function GalleryTimeAxis(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const rows = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            rows.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <Chart<Sample> data={() => rows()} xValue="at" title="Price over 2025" height={280}>
        <Line y="price" label="Price" width={2} />
        <Axis x time format={date('MMM YYYY')} />
        <Tooltip />
      </Chart>
    </div>
  )
}
