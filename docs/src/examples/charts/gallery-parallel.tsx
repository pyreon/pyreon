import { ParallelChart, type ParallelAxis, type ParallelRow } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — parallel coordinates: one polyline per row across five axes, one
 * of them categorical. "Vary" regenerates the rows.
 */
const AXES: ParallelAxis[] = [
  { name: 'Tier', type: 'category', categories: ['Free', 'Pro', 'Team'] },
  { name: 'Seats' },
  { name: 'Projects' },
  { name: 'Sessions / wk' },
  { name: 'Churn risk' },
]

function make(): ParallelRow[] {
  const rows: ParallelRow[] = []
  for (let i = 0; i < 18; i++) {
    const tier = i % 3
    rows.push([
      ['Free', 'Pro', 'Team'][tier]!,
      1 + tier * 6 + Math.round(Math.random() * 6),
      1 + Math.round(Math.random() * (4 + tier * 6)),
      Math.round(2 + Math.random() * 20),
      Math.round(Math.random() * 100) / 100,
    ])
  }
  return rows
}

export default function GalleryParallel(props: { shared?: Signal<number> }) {
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
      <ParallelChart axes={AXES} rows={() => rows()} title="Accounts" height={300} />
    </div>
  )
}
