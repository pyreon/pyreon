import { onMount } from '@pyreon/core'
import { Area, Axis, Chart, Line, smooth } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a live stream: a new sample every 250ms into a 60-point window.
 * Each write repaints the canvas and nothing else — there is no virtual DOM to
 * diff, the chart is one effect over one signal. The interval is cleared when
 * the example unmounts. The `shared` signal counts samples.
 */
interface Row {
  t: number
  v: number
}

const WINDOW = 60

export default function GalleryStream(props: { shared?: Signal<number> }) {
  const samples = props.shared ?? signal(0)
  const running = signal(true)
  let t = 0
  let v = 50
  const next = (): Row => {
    t += 1
    v = Math.max(5, Math.min(95, v + (Math.random() - 0.5) * 12))
    return { t, v }
  }
  const rows = signal<Row[]>(Array.from({ length: WINDOW }, next))
  onMount(() => {
    const id = setInterval(() => {
      if (!running()) return
      const cur = rows()
      rows.set([...cur.slice(cur.length - WINDOW + 1), next()])
      samples.update((n) => n + 1)
    }, 250)
    return () => clearInterval(id)
  })
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={() => running.set(!running())}>
          {() => (running() ? 'Pause' : 'Resume')}
        </button>
        <span>samples: {() => samples()}</span>
      </div>
      <Chart<Row> data={() => rows()} x={(d) => String(d.t)} height={240} updateAnimation={false}>
        <Area y="v" curve={smooth} label="Throughput" />
        <Line y="v" curve={smooth} width={2} label="Throughput" />
        <Axis y domain={{ min: 0, max: 100 }} />
      </Chart>
    </div>
  )
}
