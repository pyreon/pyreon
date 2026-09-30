import type { EChartsOption } from '@pyreon/charts/echarts'
import { EChart } from '@pyreon/charts/echarts'
import { state, derived } from '@pyreon/core/plain'
import { untrack } from '@pyreon/reactivity'

export function ChartDemo() {
  // ─── Bar chart data ────────────────────────────────────────────────────────
  let months = state.raw(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
  let revenue = state.raw([120, 200, 150, 80, 270, 310])
  let profit = state.raw([40, 80, 50, 20, 110, 140])

  // ─── Pie chart data ────────────────────────────────────────────────────────
  let pieData = state.raw([
    { name: 'Desktop', value: 1048 },
    { name: 'Mobile', value: 735 },
    { name: 'Tablet', value: 580 },
    { name: 'Other', value: 484 },
  ])

  // ─── Gauge value ───────────────────────────────────────────────────────────
  let gaugeValue = state(72)

  // ─── Chart type selector ───────────────────────────────────────────────────
  let chartType = state<'bar' | 'line' | 'scatter'>('bar')

  const barOptions = derived<EChartsOption>(() => ({
    title: { text: 'Revenue & Profit', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', name: '$K' },
    series: [
      {
        name: 'Revenue',
        type: chartType,
        data: revenue,
        itemStyle: { color: '#5470c6' },
      },
      {
        name: 'Profit',
        type: chartType,
        data: profit,
        itemStyle: { color: '#91cc75' },
      },
    ],
  }))

  const pieOptions = derived<EChartsOption>(() => ({
    title: { text: 'Device Share', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: pieData,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      },
    ],
  }))

  const gaugeOptions = derived<EChartsOption>(() => ({
    series: [
      {
        type: 'gauge',
        detail: { formatter: '{value}%' },
        data: [{ value: gaugeValue, name: 'Performance' }],
        axisLine: { lineStyle: { width: 20 } },
      },
    ],
  }))

  let log = state.raw<string[]>([])
  const addLog = (msg: string) => { log = [...log.slice(-9), msg] }

  return (
    <div>
      <h2>Charts</h2>
      <p class="desc">
        Reactive ECharts bridge with lazy loading. Zero ECharts bytes until a chart renders —
        modules are auto-detected and dynamically imported. Signal reads inside options functions
        trigger reactive updates.
      </p>

      {/* Bar / Line / Scatter chart */}
      <div class="section">
        <h3>Revenue Chart — Reactive Type Switching</h3>
        <div class="row" style="margin-bottom: 8px">
          {(['bar', 'line', 'scatter'] as const).map((type) => (
            <button
              type="button"
              key={type}
              class={chartType === type ? 'active' : ''}
              onClick={() => {
                chartType = type
                addLog(`Chart type → ${type}`)
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <EChart options={() => barOptions} style="height: 300px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              revenue = ((r) => r.map((v) => v + Math.round(Math.random() * 40 - 20)))(untrack(() => revenue))
              addLog('Revenue data randomized')
            }}
          >
            Randomize Revenue
          </button>
          <button
            type="button"
            onClick={() => {
              months = [...months, `M${months.length + 1}`]
              revenue = [...revenue, Math.round(Math.random() * 300)]
              profit = [...profit, Math.round(Math.random() * 150)]
              addLog('Added month')
            }}
          >
            Add Month
          </button>
        </div>
      </div>

      {/* Pie chart */}
      <div class="section">
        <h3>Donut Chart — Device Share</h3>
        <EChart options={() => pieOptions} style="height: 300px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              pieData = ((d) =>
                d.map((item) => ({
                  ...item,
                  value: Math.round(Math.random() * 1500),
                })))(untrack(() => pieData))
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
        <EChart options={() => gaugeOptions} style="height: 250px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              gaugeValue = Math.max(0, gaugeValue - 10)
              addLog(`Gauge → ${gaugeValue}%`)
            }}
          >
            -10
          </button>
          <span>
            Value: <strong>{() => gaugeValue}%</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              gaugeValue = Math.min(100, gaugeValue + 10)
              addLog(`Gauge → ${gaugeValue}%`)
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
          <code>{'<EChart options={() => ({ ... })} />'}</code> auto-detects chart types (bar, pie,
          gauge, etc.) from your config and dynamically imports only the needed ECharts modules.
          Signal reads inside the options function trigger reactive updates — change data, change
          the chart. Canvas renderer by default, SVG optional via <code>renderer="svg"</code>.
        </p>
      </div>

      {/* Log */}
      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log.length === 0 ? 'Interact with the charts above to see changes.' : log.join('\n')
          }
        </div>
      </div>
    </div>
  )
}
