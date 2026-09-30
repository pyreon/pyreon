import { Chart, Stage, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a funnel: one `<Stage>` per row, sorted largest first. "Vary"
 * regenerates the drop-off between stages.
 */
interface Step {
  name: string
  users: number
}

function make(): Step[] {
  let n = 10000
  return ['Visited', 'Signed up', 'Activated', 'Subscribed', 'Renewed'].map((name) => {
    const row = { name, users: Math.round(n) }
    n *= 0.45 + Math.random() * 0.35
    return row
  })
}

export default function GalleryFunnel(props: { shared?: Signal<number> }) {
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
      <Chart<Step> data={() => data()} height={280}>
        <Stage value="users" label="name" />
        <Tooltip />
      </Chart>
    </div>
  )
}
