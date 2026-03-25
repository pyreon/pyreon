---
title: Charts
description: Reactive ECharts bridge with lazy loading, auto-detection, and typed options for Pyreon.
---

`@pyreon/charts` provides a reactive bridge to [Apache ECharts](https://echarts.apache.org/) for Pyreon applications. Chart modules are lazy-loaded on demand -- zero bundle cost until a chart actually renders. The Canvas renderer is used by default, with SVG available as an option.

<PackageBadge name="@pyreon/charts" href="/docs/charts" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/charts
```
```bash [bun]
bun add @pyreon/charts
```
```bash [pnpm]
pnpm add @pyreon/charts
```
```bash [yarn]
yarn add @pyreon/charts
```
:::

## Quick Start

Use the `<Chart />` component to render a chart. Pass an options function that returns a standard ECharts configuration -- signal reads inside the function are tracked for reactivity.

```tsx
import { signal } from '@pyreon/reactivity'
import { Chart } from '@pyreon/charts'

function SalesChart() {
  const months = signal(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
  const revenue = signal([120, 200, 150, 80, 70, 110])

  return (
    <Chart
      options={() => ({
        xAxis: { type: 'category', data: months() },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis' },
        series: [{ name: 'Revenue', type: 'bar', data: revenue() }],
      })}
      style="height: 400px"
    />
  )
}
```

The `options` prop accepts a function (not a plain object) so that signal reads are tracked. When any signal inside the function changes, the chart re-renders automatically.

## API Reference

### `<Chart />`

The primary component for rendering charts.

| Prop | Type | Description |
|------|------|-------------|
| `options` | `() => EChartsOption` | Function returning ECharts configuration. Signal reads are tracked for reactivity. |
| `style` | `string` | Inline style string. Must include a height (ECharts requires a sized container). |
| `class` | `string` | CSS class name for the container element. |
| `renderer` | `'canvas' \| 'svg'` | Rendering mode. Defaults to `'canvas'`. |
| `onChartReady` | `(instance: ECharts) => void` | Callback fired after the chart instance is initialized. |
| `on*` | Event handlers | ECharts event bindings, e.g. `onClick`, `onMouseover`, `onLegendSelectChanged`. |

```tsx
<Chart
  options={() => ({ /* ... */ })}
  style="height: 300px"
  renderer="svg"
  onClick={(params) => console.log('Clicked:', params.name)}
  onChartReady={(instance) => console.log('Chart ready:', instance)}
/>
```

### `useChart<TOption>(optionsFn, config?)`

A lower-level hook for programmatic control. Returns reactive signals for the chart instance and error state.

```tsx
import { useChart } from '@pyreon/charts'

function MyChart() {
  const { containerRef, instance, error } = useChart(() => ({
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [10, 20, 30] }],
  }))

  return (
    <div>
      {() => error() ? <p class="error">{error()!.message}</p> : null}
      <div ref={(el) => containerRef.set(el)} style="height: 400px" />
    </div>
  )
}
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `renderer` | `'canvas' \| 'svg'` | `'canvas'` | Rendering mode |
| `notMerge` | `boolean` | `false` | Replace options entirely instead of merging |
| `lazyUpdate` | `boolean` | `false` | Defer chart update to next frame |

**Return value:**

| Property | Type | Description |
|----------|------|-------------|
| `containerRef` | `Signal<HTMLElement \| null>` | Bind to a DOM element via `ref` |
| `instance` | `Signal<ECharts \| null>` | The underlying ECharts instance (available after init) |
| `error` | `Signal<Error \| null>` | Error signal for init or setOption failures |

### Types

`@pyreon/charts` re-exports all ECharts option types for strict typing:

```tsx
import type {
  ComposeOption,
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
  RadarSeriesOption,
  HeatmapSeriesOption,
  TreemapSeriesOption,
  SankeySeriesOption,
  GaugeSeriesOption,
  FunnelSeriesOption,
  CandlestickSeriesOption,
  GraphSeriesOption,
} from '@pyreon/charts'
```

## Auto-Detection

When you provide an options function, `@pyreon/charts` inspects the configuration to determine which ECharts modules are needed:

- **Series types** (`bar`, `line`, `pie`, etc.) are detected from `series[].type`
- **Components** (`tooltip`, `legend`, `dataZoom`, etc.) are detected from top-level keys
- **Axis types** (`category`, `value`, `time`, `log`) are detected from axis config

Only the required modules are dynamically imported. A chart with `type: 'bar'` and `tooltip` will only load the bar series renderer and tooltip component -- not the full ECharts bundle.

```tsx
// Only loads: BarChart, TooltipComponent, GridComponent, CanvasRenderer
<Chart
  options={() => ({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels() },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: values() }],
  })}
  style="height: 300px"
/>
```

## Strict Typing with ComposeOption

For type-safe chart configurations, use `ComposeOption<>` to narrow the options type to only the series types you use:

```tsx
import { useChart } from '@pyreon/charts'
import type { ComposeOption, BarSeriesOption, LineSeriesOption } from '@pyreon/charts'

type DashboardOption = ComposeOption<BarSeriesOption | LineSeriesOption>

function Dashboard() {
  const chart = useChart<DashboardOption>(() => ({
    xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] },
    yAxis: { type: 'value' },
    series: [
      { type: 'bar', data: [100, 200, 150, 300] },
      { type: 'line', data: [80, 170, 130, 280] },
    ],
  }))

  return <div ref={(el) => chart.containerRef.set(el)} style="height: 400px" />
}
```

This gives you autocomplete and type checking for the specific series options you declared.

## Manual Registration

For maximum tree-shaking control, use the `@pyreon/charts/manual` entry point. This disables auto-detection and requires you to register ECharts modules explicitly:

```tsx
import { useChart, registerModules } from '@pyreon/charts/manual'
import { BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// Register once at app startup
registerModules([
  BarChart,
  LineChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
])

// Then use useChart / <Chart /> as normal
function MyChart() {
  const chart = useChart(() => ({
    series: [{ type: 'bar', data: [1, 2, 3] }],
  }))

  return <div ref={(el) => chart.containerRef.set(el)} style="height: 300px" />
}
```

Use manual registration when you need deterministic bundle sizes or are building a library that should not auto-import ECharts modules.

## Bundle Size

| Import | Approximate Size (gzipped) |
|--------|---------------------------|
| `@pyreon/charts` (wrapper only) | ~2 KB |
| + Bar chart | ~15 KB |
| + Line chart | ~18 KB |
| + Pie chart | ~12 KB |
| + Tooltip + Legend | ~8 KB |
| Full ECharts (all modules) | ~300 KB |

Auto-detection ensures you only pay for what you use. A typical dashboard with 2-3 chart types loads ~40-50 KB of ECharts code.

## Error Handling

Both `<Chart />` and `useChart()` expose an `error` signal that captures initialization and rendering failures:

```tsx
import { Chart } from '@pyreon/charts'

function SafeChart() {
  return (
    <Chart
      options={() => ({
        series: [{ type: 'bar', data: chartData() }],
      })}
      style="height: 300px"
      onError={(err) => console.error('Chart error:', err)}
    />
  )
}
```

With `useChart()`, check the error signal directly:

```tsx
import { useChart } from '@pyreon/charts'

function SafeChart() {
  const { containerRef, error } = useChart(() => ({
    series: [{ type: 'bar', data: chartData() }],
  }))

  return (
    <div>
      {() => error() ? (
        <div class="chart-error">
          <p>Failed to render chart: {error()!.message}</p>
        </div>
      ) : null}
      <div ref={(el) => containerRef.set(el)} style="height: 300px" />
    </div>
  )
}
```

Common error scenarios:
- Container element has zero height (ECharts requires a sized container)
- Invalid option structure passed to `setOption`
- Network failure when lazy-loading ECharts modules
