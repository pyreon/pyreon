import { line, PlotChart } from '@pyreon/charts/engine'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — 100,000 points, every one drawn (no decimation). "Regenerate"
 * replaces all of them and reports how long the synchronous redraw took on
 * THIS machine: `rows.set` repaints inside the write, so the time between the
 * write and the next line is the whole update, layout and canvas included.
 * The `shared` signal counts regenerations.
 */
interface Row {
  i: number
  v: number
}

const N = 100_000

function walk(): Row[] {
  const out: Row[] = []
  let v = 50
  for (let i = 0; i < N; i++) {
    v += (Math.random() - 0.5) * 2
    out.push({ i, v })
  }
  return out
}

export default function Gallery100k(props: { shared?: Signal<number> }) {
  const runs = props.shared ?? signal(0)
  const rows = signal<Row[]>(walk())
  const took = signal('—')
  const regenerate = () => {
    const next = walk()
    const t0 = performance.now()
    rows.set(next)
    took.set(`${(performance.now() - t0).toFixed(1)} ms`)
    runs.update((n) => n + 1)
  }
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={regenerate}>
          Regenerate 100,000 points
        </button>
        <span>
          last redraw: {() => took()} · runs: {() => runs()}
        </span>
      </div>
      <PlotChart<Row>
        data={() => rows()}
        x={(d) => String(d.i)}
        marks={[line((d) => d.v, { width: 1, label: 'Random walk' })]}
        height={280}
        animate={false}
        updateAnimation={false}
        tooltip
      />
    </div>
  )
}
