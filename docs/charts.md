# @pyreon/charts

Reactive ECharts bridge with lazy loading, auto-detection, and typed options. Zero ECharts bytes in your bundle until a chart renders.

## Installation

```bash
bun add @pyreon/charts echarts
```

## Usage

### `<Chart />` Component

```tsx
import { Chart } from "@pyreon/charts"

function RevenueChart() {
  return (
    <Chart
      options={() => ({
        xAxis: { type: "category", data: months() },
        yAxis: { type: "value" },
        tooltip: { trigger: "axis" },
        series: [
          { name: "Revenue", type: "bar", data: revenue() },
          { name: "Profit", type: "line", data: profit() },
        ],
      })}
      style="height: 400px"
      onClick={(params) => console.log(params.name)}
    />
  )
}
```

### `useChart(optionsFn, config?)`

For programmatic control and strict typing:

```tsx
import { useChart } from "@pyreon/charts"
import type { ComposeOption, BarSeriesOption, LineSeriesOption } from "@pyreon/charts"

type MyOption = ComposeOption<BarSeriesOption | LineSeriesOption>

const chart = useChart<MyOption>(
  () => ({
    series: [{ type: "bar", data: values() }],
  }),
  { renderer: "svg", theme: "dark" },
)

// Bind to a container element
<div ref={chart.ref} style="height: 400px" />

chart.instance()  // ECharts instance (null until mounted)
chart.loading()   // true while modules are loading
chart.error()     // Error | null
chart.resize()    // manually trigger resize
```

## API Reference

| Export | Description |
| --- | --- |
| `Chart` | Component with `options`, `theme`, `renderer`, `style`, `class`, event handlers |
| `useChart(optionsFn, config?)` | Reactive hook returning `ref`, `instance`, `loading`, `error`, `resize` |
| `ComposeOption<T>` | Type helper for strict option narrowing |
| `EChartsOption` | Full ECharts option type |
| `*SeriesOption` | Series types: `Bar`, `Line`, `Pie`, `Scatter`, `Radar`, `Heatmap`, `Treemap`, `Sankey`, `Gauge`, `Funnel`, `Candlestick`, `Graph`, `Tree`, `Sunburst`, `Boxplot` |
| `*ComponentOption` | Component types: `Title`, `Tooltip`, `Legend`, `Grid`, `DataZoom`, `VisualMap`, `Toolbox` |

Chart types and components are auto-detected from your config and dynamically imported. The config is standard ECharts -- any ECharts example works. Wrap signal reads in the options function for reactivity.
