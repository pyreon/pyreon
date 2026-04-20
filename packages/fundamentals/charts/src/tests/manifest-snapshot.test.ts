import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — charts snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/charts — Reactive ECharts bridge with lazy loading, auto-detection, typed options. ECharts imports \`tslib\` whose ESM entry is broken under esbuild. Browser tests and Vite apps need \`resolve.alias: { tslib: "tslib/tslib.es6.js" }\`. The shared \`tslibBrowserAlias(import.meta.url)\` helper from \`@pyreon/test-utils\` resolves the correct path across install layouts. Tracking upstream: microsoft/tslib#189."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/charts — Reactive ECharts

      Reactive ECharts bridge for Pyreon. Zero ECharts bytes in your bundle until a chart actually renders — chart types and components are auto-detected from your options and dynamically imported on demand. Signal-driven options reactively update the chart when tracked signals change. \`useChart\` is the low-level hook with full control; \`<Chart />\` is the declarative component with event binding. Both auto-resize via ResizeObserver and clean up on unmount.

      \`\`\`typescript
      import { Chart, useChart, type EChartsOption, type ComposeOption, type BarSeriesOption, type LineSeriesOption } from '@pyreon/charts'
      import { signal } from '@pyreon/reactivity'

      const months = signal(['Jan', 'Feb', 'Mar', 'Apr'])
      const revenue = signal([100, 200, 150, 300])

      // Declarative component — simplest usage
      <Chart
        options={() => ({
          xAxis: { type: 'category', data: months() },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: revenue() }],
          tooltip: { trigger: 'axis' },
        })}
        style="height: 400px"
        onClick={(params) => console.log('clicked:', params.name)}
      />

      // useChart hook — full control over instance lifecycle
      const MyChart = () => {
        const chart = useChart(() => ({
          xAxis: { type: 'category', data: months() },
          yAxis: { type: 'value' },
          series: [
            { type: 'bar', data: revenue() },
            { type: 'line', data: revenue().map((v) => v * 1.1) },
          ],
        }))

        return (
          <div>
            {() => chart.loading() ? 'Loading chart...' : null}
            <div ref={chart.ref} style="height: 400px" />
            <button onClick={() => chart.resize()}>Resize</button>
          </div>
        )
      }

      // Strict typed options — only bar + line allowed
      type MyOption = ComposeOption<BarSeriesOption | LineSeriesOption>
      const typedChart = useChart<MyOption>(() => ({
        series: [{ type: 'bar', data: [1, 2, 3] }],  // only 'bar' | 'line' autocomplete
      }))

      // Manual entry for tree-shaking control:
      // import { useChart, Chart } from '@pyreon/charts/manual'
      // — you register ECharts components yourself
      \`\`\`

      > **tslib browser alias**: ECharts imports \`tslib\` whose ESM entry is broken under esbuild. Browser tests and Vite apps need \`resolve.alias: { tslib: "tslib/tslib.es6.js" }\`. The shared \`tslibBrowserAlias(import.meta.url)\` helper from \`@pyreon/test-utils\` resolves the correct path across install layouts. Tracking upstream: microsoft/tslib#189.
      >
      > **Note**: Options must be a FUNCTION \`() => EChartsOption\`, not a plain object. Signal reads inside the function are tracked — changing any tracked signal reactively updates the chart.
      >
      > **Lazy loading**: ECharts modules are auto-detected from your options (series types, components) and dynamically imported. First render has an async loading phase — check \`loading()\` or \`<Chart>\` handles it internally. Zero ECharts bytes in your initial bundle.
      >
      > **Manual entry**: \`@pyreon/charts/manual\` skips auto-detection — you register ECharts components yourself via \`use()\` for maximum tree-shaking control.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
  })
})
