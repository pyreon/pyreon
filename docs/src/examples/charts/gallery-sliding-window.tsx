import { Bar, Chart, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a keyed sliding window: "Vary" drops the oldest bar and appends a
 * new one. `by="t"` gives each row an identity, so every bar tweens from its
 * own previous value and slides left; without it rows match by position and
 * each bar would animate toward its neighbour's value.
 */
interface Tick {
  t: string
  load: number
}

let next = 0
function tick(): Tick {
  next += 1
  return { t: `T${next}`, load: Math.round(20 + Math.random() * 70) }
}

export default function GallerySlidingWindow(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const rows = signal<Tick[]>(Array.from({ length: 12 }, tick))
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            rows.set([...rows().slice(1), tick()])
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <Chart<Tick> data={() => rows()} x="t" by="t" title="CPU load (%)" height={260}>
        <Bar y="load" label="Load" />
        <Tooltip />
      </Chart>
    </div>
  )
}
