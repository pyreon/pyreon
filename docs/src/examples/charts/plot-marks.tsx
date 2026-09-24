import { Area, Bar, Chart, Dot, Legend, Line, Tooltip, currency, smooth } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Live `@pyreon/charts` demo — the REAL engine, not a re-implementation.
 *
 * Shows the three things the plot engine is actually about: marks compose in
 * paint order (area under line under points), `data` as an ACCESSOR is what
 * makes the chart reactive, and one `format` feeds the axis, the tooltip and
 * the accessible description together.
 *
 * The `shared` signal counts regenerations — bridge it with
 * `<Example ... share="chart-refreshes" />` and any other Example on the page
 * reading the same signal reacts. Falls back to a local signal when unbridged
 * (the "bridgeable, not require-bridged" contract).
 */
interface Row {
  month: string
  revenue: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

function makeRows(): Row[] {
  return MONTHS.map((month) => ({
    month,
    revenue: 800 + Math.round(Math.random() * 2600),
  }))
}

export default function PlotMarks(props: { shared?: Signal<number> }) {
  const refreshes = props.shared ?? signal(0)
  const rows = signal<Row[]>(makeRows())
  const selected = signal<string>('—')

  const regenerate = () => {
    rows.set(makeRows())
    refreshes.update((n) => n + 1)
  }

  return (
    <div class="example-col">
      <div class="example-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" onClick={regenerate}>
          Regenerate data
        </button>
        <span>
          refreshes: {() => refreshes()} · selected: {() => selected()}
        </span>
      </div>

      {/*
        `data` is an ACCESSOR, so the chart repaints whenever `rows` changes.
        Passing `data={rows()}` instead would read the signal once at setup and
        the chart would never update.
      */}
      <Chart<Row>
        data={() => rows()}
        x="month"
        height={260}
        format={currency('$')}
        title="Monthly revenue"
        onSelect={(index) => {
          selected.set(index < 0 ? '—' : (rows()[index]?.month ?? '—'))
        }}
      >
        <Area y="revenue" color="#dbeafe" />
        <Line y="revenue" color="#2563eb" width={2} curve={smooth} label="Revenue" />
        <Dot y="revenue" color="#2563eb" radius={3} />
        <Legend />
        <Tooltip />
      </Chart>

      {/* A second chart over the same rows — bars, no curve, values drawn on. */}
      <Chart<Row> data={() => rows()} x="month" height={200} format={currency('$')} title="Monthly revenue (bars)">
        <Bar y="revenue" color="#16a34a" label="Revenue" showValues />
      </Chart>
    </div>
  )
}
