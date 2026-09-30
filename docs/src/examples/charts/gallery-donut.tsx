import { Arc, Chart, Legend, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a donut: an `<Arc>` with an inner radius, and a legend whose
 * entries toggle their slices (click one). The `shared` signal counts "Vary"
 * presses.
 */
interface Slice {
  name: string
  value: number
}

function make(): Slice[] {
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
      <Chart<Slice> data={() => data()} height={300}>
        <Arc value="value" label="name" innerRadius={0.62} />
        <Legend position="bottom" />
        <Tooltip />
      </Chart>
    </div>
  )
}
