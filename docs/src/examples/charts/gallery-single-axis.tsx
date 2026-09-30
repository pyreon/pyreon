import { SingleAxisChart, type SingleAxisPoint } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a single axis: points along one categorical axis, sized by a
 * second value. "Vary" regenerates the sizes.
 */
const HOURS = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h']

function make(): SingleAxisPoint[] {
  return HOURS.map((name, i) => ({ x: i, size: Math.round(2 + Math.random() * 18), name }))
}

export default function GallerySingleAxis(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const points = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            points.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <SingleAxisChart axis={{ type: 'category', categories: HOURS, name: 'Deploys' }} points={() => points()} title="Deploys by hour" height={160} />
    </div>
  )
}
