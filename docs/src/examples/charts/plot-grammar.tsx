import { Area, Axis, Bar, Legend, Line, Plot, Rule, Tip, Zoom, compact } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * The grammar — marks as children, channels as field names.
 *
 * Nothing here is a `marks={[…]}` array or an accessor: `y="revenue"` is a
 * typed field name, layering is the order of the children, and the tooltip,
 * legend, zoom and reference line are declared next to the marks they apply
 * to. Toggle the trend to see a `<Show>` around a mark add and remove a series.
 */
interface Row {
  month: string
  revenue: number
  cost: number
  target: number
}

const ROWS: Row[] = [
  { month: 'Jan', revenue: 42, cost: 31, target: 40 },
  { month: 'Feb', revenue: 55, cost: 36, target: 45 },
  { month: 'Mar', revenue: 49, cost: 34, target: 50 },
  { month: 'Apr', revenue: 63, cost: 40, target: 55 },
  { month: 'May', revenue: 58, cost: 39, target: 60 },
  { month: 'Jun', revenue: 71, cost: 44, target: 65 },
]

export default function PlotGrammar(props: { shared?: Signal<number> }) {
  const toggles = props.shared ?? signal(0)
  const showTarget = signal(true)
  const flip = () => {
    showTarget.set(!showTarget())
    toggles.update((n) => n + 1)
  }
  return (
    <div class="example-col">
      <div class="example-row" style={{ gap: '8px', alignItems: 'center' }}>
        <button type="button" onClick={flip}>
          {() => (showTarget() ? 'Hide target' : 'Show target')}
        </button>
        <span>toggles: {() => toggles()}</span>
      </div>
      <Plot<Row> data={ROWS} x="month" height={240} animate={false}>
        <Area y="cost" label="Cost" />
        <Bar y="revenue" label="Revenue" />
        {() => showTarget() && <Line y="target" label="Target" width={2} />}
        <Rule y={60} label="goal" />
        <Axis y format={compact} />
        <Tip crosshair />
        <Legend />
        <Zoom />
      </Plot>
    </div>
  )
}
