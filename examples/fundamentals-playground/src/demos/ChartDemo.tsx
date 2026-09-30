import { Arc, Axis, Bar, Chart, Dot, GaugeChart, Legend, Line, Tooltip } from '@pyreon/charts'
import { computed, signal } from '@pyreon/reactivity'

export function ChartDemo() {
  // ─── Bar chart data ────────────────────────────────────────────────────────
  const months = signal(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
  const revenue = signal([120, 200, 150, 80, 270, 310])
  const profit = signal([40, 80, 50, 20, 110, 140])
  const rows = computed(() => months().map((month, i) => ({ month, revenue: revenue()[i] ?? 0, profit: profit()[i] ?? 0 })))

  // ─── Pie chart data ────────────────────────────────────────────────────────
  const pieData = signal([
    { name: 'Desktop', value: 1048 },
    { name: 'Mobile', value: 735 },
    { name: 'Tablet', value: 580 },
    { name: 'Other', value: 484 },
  ])

  // ─── Gauge value ───────────────────────────────────────────────────────────
  const gaugeValue = signal(72)

  // ─── Mark selector ─────────────────────────────────────────────────────────
  const chartType = signal<'bar' | 'line' | 'scatter'>('bar')

  const log = signal<string[]>([])
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg])

  return (
    <div>
      <h2>Charts</h2>
      <p class="desc">
        Pyreon's own charting engine: marks are JSX children, channels are field names. Writing a
        signal repaints the canvas in place, and a chart pays only for the marks it imports.
      </p>

      {/* Bar / Line / Scatter chart */}
      <div class="section">
        <h3>Revenue Chart — Switching the Mark</h3>
        <div class="row" style="margin-bottom: 8px">
          {(['bar', 'line', 'scatter'] as const).map((type) => (
            <button
              type="button"
              key={type}
              class={chartType() === type ? 'active' : ''}
              onClick={() => {
                chartType.set(type)
                addLog(`Chart type → ${type}`)
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        {() => {
          const type = chartType()
          return (
            <Chart data={() => rows()} x="month" height={300} title="Revenue & Profit">
              {type === 'bar' ? <Bar y="revenue" label="Revenue" group /> : type === 'line' ? <Line y="revenue" label="Revenue" /> : <Dot y="revenue" label="Revenue" />}
              {type === 'bar' ? <Bar y="profit" label="Profit" group /> : type === 'line' ? <Line y="profit" label="Profit" /> : <Dot y="profit" label="Profit" />}
              <Axis y title="$K" />
              <Tooltip />
              <Legend position="bottom" />
            </Chart>
          )
        }}
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              revenue.update((r) => r.map((v) => v + Math.round(Math.random() * 40 - 20)))
              addLog('Revenue data randomized')
            }}
          >
            Randomize Revenue
          </button>
          <button
            type="button"
            onClick={() => {
              months.update((m) => [...m, `M${m.length + 1}`])
              revenue.update((r) => [...r, Math.round(Math.random() * 300)])
              profit.update((p) => [...p, Math.round(Math.random() * 150)])
              addLog('Added month')
            }}
          >
            Add Month
          </button>
        </div>
      </div>

      {/* Donut */}
      <div class="section">
        <h3>Donut Chart — Device Share</h3>
        <Chart data={() => pieData()} height={300} title="Device Share">
          <Arc value="value" label="name" innerRadius={0.57} />
          <Tooltip />
        </Chart>
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              pieData.update((d) =>
                d.map((item) => ({
                  ...item,
                  value: Math.round(Math.random() * 1500),
                })),
              )
              addLog('Pie data randomized')
            }}
          >
            Randomize Values
          </button>
        </div>
      </div>

      {/* Gauge */}
      <div class="section">
        <h3>Gauge — Performance Score</h3>
        <GaugeChart value={() => gaugeValue()} title="Performance" height={200} />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              gaugeValue.update((v) => Math.max(0, v - 10))
              addLog(`Gauge → ${gaugeValue()}%`)
            }}
          >
            -10
          </button>
          <span>
            Value: <strong>{() => gaugeValue()}%</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              gaugeValue.update((v) => Math.min(100, v + 10))
              addLog(`Gauge → ${gaugeValue()}%`)
            }}
          >
            +10
          </button>
        </div>
      </div>

      {/* API info */}
      <div class="section">
        <h3>How It Works</h3>
        <p style="font-size: 13px; opacity: 0.7; line-height: 1.6">
          <code>{'<Chart data={rows} x="month"><Bar y="revenue" /></Chart>'}</code> — the chart
          reads its rows through the accessor, so a signal write repaints in place. Every mark is an
          imported binding: a bar chart carries no pie code. The same source renders SVG on a server
          (<code>@pyreon/charts/svg</code>) and natively on iOS and Android.
        </p>
      </div>

      {/* Log */}
      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log().length === 0 ? 'Interact with the charts above to see changes.' : log().join('\n')
          }
        </div>
      </div>
    </div>
  )
}
