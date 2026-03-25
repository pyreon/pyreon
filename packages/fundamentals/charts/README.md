# @pyreon/charts

Reactive ECharts bridge for Pyreon. Lazy loading, signal-driven updates, Canvas by default.

Zero ECharts bytes in your bundle until a chart actually renders. Chart types and components are auto-detected from your config and dynamically imported on demand.

## Install

```bash
bun add @pyreon/charts echarts
```

## Quick Start

```tsx
import { Chart } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

function RevenueChart() {
  const revenue = signal([120, 200, 150, 80, 70, 110, 130])

  return (
    <Chart
      options={() => ({
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'] },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis' },
        series: [{ type: 'bar', data: revenue() }],
      })}
      style="height: 400px"
    />
  )
}
```

Signal changes → chart updates automatically. No manual `setOption` calls.

## How it works

1. You write a config object with `type: 'bar'` in series
2. The bridge detects: needs `BarChart` + `GridComponent` + `TooltipComponent` + `CanvasRenderer`
3. Dynamically imports only those ECharts modules (~35KB vs 300KB+ full)
4. Creates the chart instance with Canvas renderer
5. Sets up a reactive effect — when signals in your config function change, `setOption()` is called
6. ResizeObserver auto-resizes the chart
7. On unmount, chart is disposed and observer disconnected

## API

### `<Chart />`

Component shorthand wrapping `useChart`.

```tsx
<Chart
  options={() => ({
    series: [{ type: 'pie', data: segments() }],
    legend: {},
  })}
  theme="dark"
  style="height: 300px"
  class="my-chart"
  onClick={(params) => console.log(params)}
/>
```

| Prop | Type | Description |
| --- | --- | --- |
| `options` | `() => EChartOption` | Reactive config function |
| `theme?` | `string \| object` | ECharts theme |
| `renderer?` | `'canvas' \| 'svg'` | Renderer (default: `'canvas'`) |
| `style?` | `string` | CSS style for container |
| `class?` | `string` | CSS class for container |
| `onClick?` | `(params) => void` | Click event |
| `onMouseover?` | `(params) => void` | Mouseover event |
| `onMouseout?` | `(params) => void` | Mouseout event |

### `useChart(options, config?)`

Core hook for programmatic control.

```tsx
const chart = useChart(() => ({
  xAxis: { data: months() },
  series: [{ type: 'line', data: values(), smooth: true }],
}))

return <div ref={chart.ref} style="height: 400px" />
```

**Returns:**

| Property | Type | Description |
| --- | --- | --- |
| `ref` | `(el: HTMLElement \| null) => void` | Bind to container div |
| `instance` | `Signal<ECharts \| null>` | ECharts instance (null until loaded) |
| `loading` | `Signal<boolean>` | True while modules are loading |
| `resize` | `() => void` | Manually trigger resize |

**Config options:**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `string \| object` | — | ECharts theme |
| `renderer` | `'canvas' \| 'svg'` | `'canvas'` | Rendering engine |
| `locale` | `string` | `'EN'` | ECharts locale |
| `notMerge` | `boolean` | `false` | Replace options instead of merging |
| `lazyUpdate` | `boolean` | `true` | Batch updates |
| `onInit` | `(instance) => void` | — | Called when chart is created |

## Manual Registration (Tree-shaking)

For apps that want absolute minimal bundles, explicitly import only what you need:

```tsx
import { useChart, Chart, use } from '@pyreon/charts/manual'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use(BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer)

// Same API — no dynamic imports, no loading state
<Chart
  options={() => ({
    series: [{ type: 'bar', data: values() }],
  })}
  style="height: 400px"
/>
```

## Supported Chart Types

bar, line, pie, scatter, radar, heatmap, treemap, sunburst, sankey, funnel, gauge, graph, tree, boxplot, candlestick, parallel, themeRiver, effectScatter, lines, pictorialBar, custom, map

## Supported Components

tooltip, legend, title, toolbox, dataZoom, visualMap, timeline, graphic, brush, calendar, dataset, aria, grid (also implied by xAxis/yAxis), polar, radar, geo

## Bundle Size

| Usage | ECharts loaded | Approx gzipped |
| --- | --- | --- |
| No charts rendered | Nothing | 0 KB |
| Bar + tooltip | core + BarChart + Grid + Tooltip + Canvas | ~35 KB |
| Bar + Line + legend | core + BarChart + LineChart + Grid + Legend + Tooltip + Canvas | ~42 KB |
| Pie only | core + PieChart + Canvas | ~25 KB |
| @pyreon/charts itself | Module map + hook | ~3 KB |

## Why Canvas by default

Canvas renders the entire chart as a single `<canvas>` element. SVG creates hundreds of DOM elements for complex charts. Canvas is better for:

- Charts with many data points
- Frequent signal-driven updates
- Animations
- Memory efficiency

Use `renderer: 'svg'` only when you need CSS styling on individual elements or PDF export.
