import { Bar, Chart, Legend, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — the same three series as a stack or side by side. `stack` and
 * `group` are props on each `<Bar>`; reading a signal there makes the switch
 * reactive, so it repaints the same canvas. With `updateAnimation` on (the
 * default) a same-shape change tweens, a shape change snaps.
 * The `shared` signal counts switches.
 */
interface Row {
  region: string
  web: number
  store: number
  partner: number
}

const ROWS: Row[] = [
  { region: 'North', web: 42, store: 28, partner: 12 },
  { region: 'South', web: 31, store: 35, partner: 18 },
  { region: 'East', web: 55, store: 22, partner: 9 },
  { region: 'West', web: 38, store: 30, partner: 21 },
  { region: 'Central', web: 26, store: 41, partner: 15 },
]

export default function GalleryBars(props: { shared?: Signal<number> }) {
  const switches = props.shared ?? signal(0)
  const stacked = signal(true)
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            stacked.set(!stacked())
            switches.update((n) => n + 1)
          }}
        >
          {() => (stacked() ? 'Show grouped' : 'Show stacked')}
        </button>
        <span>switches: {() => switches()}</span>
      </div>
      <Chart<Row> data={ROWS} x="region" height={280} title="Orders by channel">
        <Bar y="web" label="Web" stack={stacked()} group={!stacked()} />
        <Bar y="store" label="Store" stack={stacked()} group={!stacked()} />
        <Bar y="partner" label="Partner" stack={stacked()} group={!stacked()} />
        <Legend />
        <Tooltip />
      </Chart>
    </div>
  )
}
