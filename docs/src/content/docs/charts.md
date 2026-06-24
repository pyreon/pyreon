---
title: Charts
description: Reactive ECharts bridge with lazy loading, auto-detection, and typed options for Pyreon.
---

`@pyreon/charts` is a reactive bridge to [Apache ECharts](https://echarts.apache.org/) for Pyreon. You write ECharts options as a **function** — signal reads inside are tracked, so the chart re-renders whenever any tracked signal changes. ECharts itself is **lazy-loaded**: chart types and components are auto-detected from your options and dynamically imported on first render, so there are zero ECharts bytes in your initial bundle until a chart actually mounts.

<PackageBadge name="@pyreon/charts" href="/docs/charts" />

## Installation

`@pyreon/charts` declares `echarts` as a **peer dependency** (`>=5.6.0`) — install it alongside the package.

:::code-group

```bash [npm]
npm install @pyreon/charts echarts
```

```bash [bun]
bun add @pyreon/charts echarts
```

```bash [pnpm]
pnpm add @pyreon/charts echarts
```

```bash [yarn]
yarn add @pyreon/charts echarts
```

:::

## Required Vite setup (`tslib` alias)

:::danger[This is the #1 real-world charts breakage — set it up first]
The moment ECharts loads, your page throws:

```text
TypeError: Cannot destructure property '__extends' of '__toESM(...).default' as it is undefined
```

…and every chart silently renders as an **empty div**. You **must** add the `tslib` alias to your `vite.config.ts` before charts will render.
:::

ECharts imports `tslib` for its TypeScript helpers (`__extends`, `__assign`, …). tslib's `package.json` `exports` map points the `import` condition at `./modules/index.js`, which destructures those helpers from a `__toESM(require_tslib())` default — but the helpers live as top-level `var`s on the CJS factory, **not** as properties of the default export. The destructure reads `undefined`, and ECharts throws on first chart mount.

`@pyreon/charts/vite` ships `chartsViteAlias()`, which resolves `tslib` to the flat-ESM `tslib.es6.js` and sidesteps the broken indirection. Spread it into `resolve.alias`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { chartsViteAlias } from '@pyreon/charts/vite'

export default defineConfig({
  resolve: {
    alias: {
      ...chartsViteAlias(),
    },
  },
})
```

`chartsViteAlias()` walks common install layouts (bun's nested layout, hoisted `node_modules`) to locate `tslib.es6.js`. If it can't find tslib it returns `{}` — a no-op — so apps that don't actually use `@pyreon/charts` won't have their config broken by the spread.

:::tip[The error message points you here]
If the alias is missing, `@pyreon/charts` detects the canonical tslib symptom at load time and **re-throws with an actionable message** telling you to add `chartsViteAlias()` — instead of leaving you with a raw `__extends` destructure error. The original error is preserved in the message.
:::

:::note[Browser tests]
Inside the monorepo, browser tests use `tslibBrowserAlias()` from the shared test config rather than `chartsViteAlias()` (vite-config files load under Node's `node` condition; vitest browser configs load inside the runner's bundler context — two different resolution roots). Tracking upstream: [microsoft/tslib#189](https://github.com/microsoft/tslib/issues/189).
:::

## Quick Start

The `<Chart />` component is the simplest way to render a chart. Pass an `options` **function** that returns a standard ECharts configuration. Signal reads inside the function are tracked, so the chart updates reactively.

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

:::warning[`options` must be a FUNCTION, not a plain object]
`@pyreon/charts` tracks the signals you read **inside** the options function. If you pass a static object (`options={ { ... } }`), the signal reads happen once at render and are never tracked — the chart will render once and never update when your data changes. Always wrap in `() => ({ ... })`.
:::

:::warning[The container needs an explicit height]
ECharts does **not** auto-size to its content — it measures the container element. If the container has zero height (the default for an empty `<div>`), the chart renders but is invisible. Always set a height via `style` (or `class`), e.g. `style="height: 400px"`.
:::

## The `options` object

The value your `options` function returns is a **standard ECharts option object** — `@pyreon/charts` does not invent its own option shape. For the full option reference (every series type, axis, component, and their fields), see the [ECharts option docs](https://echarts.apache.org/en/option.html). This page documents the **Pyreon bridge** around that object: how it's made reactive, how modules are lazy-loaded, and how the component/hook lifecycle works.

`@pyreon/charts` re-exports ECharts' option types so you can import them from one place (no direct `echarts` import needed for typing):

```tsx
import type {
  EChartsOption,
  ComposeOption,
  // Series option types
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
  RadarSeriesOption,
  HeatmapSeriesOption,
  TreemapSeriesOption,
  TreeSeriesOption,
  SunburstSeriesOption,
  SankeySeriesOption,
  GaugeSeriesOption,
  FunnelSeriesOption,
  CandlestickSeriesOption,
  BoxplotSeriesOption,
  GraphSeriesOption,
  // Component option types
  TitleComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
  GridComponentOption,
  ToolboxComponentOption,
  DataZoomComponentOption,
  VisualMapComponentOption,
} from '@pyreon/charts'
```

## Reactive options

Because options are a function, the chart is fully reactive — write to a signal and the chart updates in place. There is no manual `setOption` call; the bridge runs it for you whenever a tracked signal changes.

```tsx
import { signal } from '@pyreon/reactivity'
import { Chart } from '@pyreon/charts'

function LiveChart() {
  const data = signal([10, 20, 30])

  // Mutate the signal — the chart re-renders automatically
  setInterval(() => {
    data.update((d) => d.map((v) => v + Math.round(Math.random() * 10 - 5)))
  }, 1000)

  return (
    <Chart
      options={() => ({
        xAxis: { type: 'category', data: ['A', 'B', 'C'] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: data() }],
      })}
      style="height: 300px"
    />
  )
}
```

By default the bridge calls ECharts' `setOption` with `notMerge: false` and `lazyUpdate: true` — updates are **merged** into the existing option and **batched** to the next frame. Set `notMerge` to replace the whole option, or `lazyUpdate: false` to update synchronously (see [Configuration](#configuration)).

## Event handling

Both `<Chart />` and `useChart` bind handlers to the underlying ECharts instance. The component exposes three event props that wire to the corresponding ECharts events:

```tsx
<Chart
  options={() => ({
    series: [{ type: 'pie', data: [
      { value: 60, name: 'A' },
      { value: 40, name: 'B' },
    ] }],
  })}
  style="height: 300px"
  onClick={(params) => console.log('clicked:', params.name, params.value)}
  onMouseover={(params) => console.log('hover:', params.name)}
  onMouseout={(params) => console.log('leave:', params.name)}
/>
```

Handlers receive a `ChartEventParams` object — a duck-typed shape carrying the common ECharts event fields (`name`, `value`, `seriesIndex`, `dataIndex`, `seriesName`, `componentType`, `color`, `event`, …) plus an index signature for any other field ECharts attaches.

:::note[Only `onClick`, `onMouseover`, and `onMouseout` are wired]
The `<Chart />` component binds exactly these three ECharts events. For other ECharts events (`legendselectchanged`, `datazoom`, `brush`, …), use [`useChart`](#usechart) and call `chart.instance()?.on('eventName', handler)` directly on the ECharts instance once it's ready.
:::

For any event the component doesn't expose, drop down to `useChart` and bind imperatively:

```tsx
import { effect } from '@pyreon/reactivity'
import { useChart } from '@pyreon/charts'

function ZoomableChart() {
  const chart = useChart(() => ({
    /* ... */
  }))

  // Bind a non-built-in event once the instance is ready
  effect(() => {
    const inst = chart.instance()
    if (!inst) return
    inst.on('datazoom', (params) => console.log('zoomed', params))
  })

  return <div ref={chart.ref} style="height: 400px" />
}
```

## `useChart`

`useChart<TOption>(optionsFn, config?)` is the low-level hook with full lifecycle control. `<Chart />` is built on top of it. Use the hook when you need the raw ECharts instance, a manual `resize()`, or access to the `loading` / `error` signals.

```tsx
import { useChart } from '@pyreon/charts'

function MyChart() {
  const chart = useChart(() => ({
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [10, 20, 30] }],
  }))

  return (
    <div>
      {() => (chart.loading() ? <p>Loading chart…</p> : null)}
      <div ref={chart.ref} style="height: 400px" />
      <button onClick={() => chart.resize()}>Resize</button>
    </div>
  )
}
```

### Return value

| Property   | Type                          | Description                                                                                   |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `ref`      | `(el: Element \| null) => void` | Callback ref — bind it to your container div: `<div ref={chart.ref}>`. Chart init defers until the element is attached. |
| `instance` | `Signal<ECharts \| null>`     | The underlying ECharts instance. `null` until modules load and the chart initializes.         |
| `loading`  | `Signal<boolean>`             | `true` while ECharts modules are being dynamically imported and the chart is initializing.     |
| `error`    | `Signal<Error \| null>`       | Set if module loading, `init`, or `setOption` throws. `null` once a render succeeds.           |
| `resize`   | `() => void`                  | Manually trigger an ECharts resize (also happens automatically — see [Auto-resize](#auto-resize-and-cleanup)). |

:::warning[`ref` is a callback, not a signal]
Bind the container with `<div ref={chart.ref} />` — `chart.ref` is a function the runtime calls with the element. There is no `containerRef` signal and no `.set()` call. Chart initialization is **deferred until the element is attached**: the hook watches for the ref callback to fire, so binding after mount works correctly.
:::

:::warning[`instance()` is `null` until the async load completes]
ECharts modules are dynamically imported, so the instance does not exist synchronously after `useChart` returns. Reading `chart.instance()` immediately will give you `null`. Gate on `chart.loading()` (or read `instance` inside an effect that re-runs when it becomes non-null) before touching the imperative ECharts API.
:::

### `ComposeOption` — strict typed options

By default `useChart` (and `<Chart />`) accept the broad `EChartsOption` type. To get **exact autocomplete** for only the series types you use, pass a `TOption` built with ECharts' `ComposeOption<>` helper:

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
      // { type: 'pie', ... } would be a type error — not in the union
    ],
  }))

  return <div ref={chart.ref} style="height: 400px" />
}
```

The same generic works on the component via `<Chart<DashboardOption> options={…} />`.

## `<Chart />`

The declarative component. It wraps `useChart` internally, renders the container div for you, binds the three built-in events, and surfaces errors.

```tsx
<Chart
  options={() => ({
    /* ECharts option */
  })}
  style="height: 300px"
  renderer="svg"
  onInit={(instance) => console.log('chart ready:', instance)}
  onClick={(params) => console.log('clicked:', params.name)}
/>
```

### Props

| Prop          | Type                                  | Default    | Description                                                                          |
| ------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `options`     | `() => EChartsOption`                 | —          | **Required.** Function returning the ECharts option. Signal reads are tracked.       |
| `style`       | `string`                              | —          | Inline style for the container. Must include a height.                               |
| `class`       | `string`                              | —          | CSS class for the container.                                                         |
| `theme`       | `string \| Record<string, unknown>`   | —          | ECharts theme — `'dark'`, a registered theme name, or a theme object.                |
| `renderer`    | `'canvas' \| 'svg'`                   | `'canvas'` | Rendering mode.                                                                      |
| `locale`      | `string`                              | `'EN'`     | ECharts locale, e.g. `'ZH'`.                                                          |
| `notMerge`    | `boolean`                             | `false`    | Replace the option entirely on update instead of merging.                            |
| `lazyUpdate`  | `boolean`                             | `true`     | Batch updates to the next frame.                                                     |
| `onInit`      | `(instance: ECharts) => void`         | —          | Called once when the ECharts instance is created.                                    |
| `onClick`     | `(params: ChartEventParams) => void`  | —          | ECharts `click` handler.                                                              |
| `onMouseover` | `(params: ChartEventParams) => void`  | —          | ECharts `mouseover` handler.                                                          |
| `onMouseout`  | `(params: ChartEventParams) => void`  | —          | ECharts `mouseout` handler.                                                           |

:::warning[Set a height on the `<Chart />` style]
Same rule as `useChart` — ECharts requires explicit container dimensions. `<Chart options={…} />` with no `style` height renders an invisible chart.
:::

## Configuration

`useChart`'s second argument (`UseChartConfig`) — and the corresponding `<Chart />` props — accept these options. They are read once when the chart is created (except the option-update flags, which apply to every reactive update).

| Option             | Type                                | Default                | Description                                                                 |
| ------------------ | ----------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `theme`            | `string \| Record<string, unknown>` | —                      | ECharts theme — `'dark'`, a registered theme name, or a theme object.       |
| `renderer`         | `'canvas' \| 'svg'`                 | `'canvas'`             | Rendering mode. Canvas has the best performance; SVG is crisp and printable. |
| `locale`           | `string`                            | `'EN'`                 | ECharts locale.                                                             |
| `notMerge`         | `boolean`                           | `false`                | On reactive update, replace the option instead of merging.                  |
| `lazyUpdate`       | `boolean`                           | `true`                 | On reactive update, batch to the next frame.                                |
| `devicePixelRatio` | `number`                            | `window.devicePixelRatio` | Override the device pixel ratio.                                         |
| `width`            | `number`                            | container width        | Explicit width override passed to `init`.                                   |
| `height`           | `number`                            | container height       | Explicit height override passed to `init`.                                  |
| `onInit`           | `(instance: ECharts) => void`       | —                      | Called once when the ECharts instance is created.                           |

```tsx
const chart = useChart(
  () => ({ series: [{ type: 'bar', data: values() }] }),
  {
    renderer: 'svg',
    theme: 'dark',
    notMerge: true, // replace, don't merge, on every update
    onInit: (instance) => console.log('created', instance),
  },
)
```

## Lazy loading & auto-detection

`@pyreon/charts` ships **zero ECharts bytes** in your initial bundle. When a chart first renders, the bridge inspects the option object and dynamically imports only the modules it needs:

- **`echarts/core`** itself is loaded on first render (not at import time).
- **Series renderers** are detected from each `series[].type` (`bar`, `line`, `pie`, `scatter`, `radar`, `heatmap`, `treemap`, `sunburst`, `sankey`, `funnel`, `gauge`, `graph`, `tree`, `boxplot`, `candlestick`, `parallel`, `themeRiver`, `effectScatter`, `lines`, `pictorialBar`, `custom`, `map`).
- **Components** are detected from top-level option keys (`tooltip`, `legend`, `title`, `toolbox`, `dataZoom`, `visualMap`, `timeline`, `graphic`, `brush`, `calendar`, `dataset`, `aria`, `grid`, `polar`, `radar`, `geo`). Note: `xAxis` / `yAxis` both pull in the `GridComponent`.
- **Series-level features** are detected from series keys (`markPoint`, `markLine`, `markArea`).
- **The renderer** (`CanvasRenderer` or `SVGRenderer`) is always loaded for the configured `renderer`.

```tsx
// First render dynamically imports ONLY:
//   echarts/core, BarChart, GridComponent (from xAxis/yAxis),
//   TooltipComponent, CanvasRenderer
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

Loaded modules are **cached and deduplicated** — a second chart of the same type registers instantly, and concurrent loads of the same module share one in-flight promise. A failed load (e.g. a network blip fetching an ECharts chunk) is **not** cached as a permanent rejection, so a later retry can succeed.

:::note[The async loading phase]
First render of a given chart type has a brief async phase while modules import. `<Chart />` handles it internally (the div is empty until the chart is ready). With `useChart`, gate your UI on `chart.loading()`.
:::

## Manual registration (`@pyreon/charts/manual`)

For deterministic bundle sizes — or when building a library that shouldn't pull ECharts modules in automatically — use the `@pyreon/charts/manual` entry. It exposes the same `useChart` / `Chart` / types, plus a `use()` function. You import and register the ECharts modules yourself; the bundler tree-shakes everything you don't register.

```tsx
import { useChart, Chart, use } from '@pyreon/charts/manual'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// Register once at app startup — variadic, pass the modules directly
use(BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer)

// Then use Chart / useChart exactly as with the default entry
function MyChart() {
  const chart = useChart(() => ({
    series: [{ type: 'bar', data: [1, 2, 3] }],
  }))

  return <div ref={chart.ref} style="height: 300px" />
}
```

:::warning[`use(...)` is variadic — not `registerModules([...])`]
The manual entry's registration function is `use`, called with the modules as **arguments** (`use(BarChart, GridComponent, …)`), not an array. It is re-exported from `@pyreon/charts/manual` (under the hood it's ECharts' own `echarts/core` `use`). If you call `use(...)` before `echarts/core` has loaded, the registration is queued and applied once core resolves.
:::

:::tip[When to reach for manual]
Use the default entry (auto-detection) for app code — it gives you zero-config lazy loading. Reach for `@pyreon/charts/manual` when you need a guaranteed, deterministic bundle (e.g. shipping a component library, or pinning exactly which ECharts modules ship).
:::

## Auto-resize and cleanup

`useChart` (and therefore `<Chart />`) observes the container with a `ResizeObserver` and calls `chart.resize()` whenever the container's size changes — no manual wiring needed. You can also trigger a resize yourself via the `resize()` return value (useful after a layout change a `ResizeObserver` won't catch, like a programmatic style swap).

On unmount the bridge disconnects the observer and calls `chart.dispose()` on the ECharts instance, so charts clean up after themselves with no leak.

:::note[Browser-only]
`useChart` is a browser hook — it touches the DOM and `ResizeObserver`. During SSR it no-ops safely (no chart is created on the server). Charts render on the client after hydration.
:::

## Error handling

The bridge captures errors from module loading, `init`, and `setOption` into the `error` signal. With `useChart`, read it directly:

```tsx
import { useChart } from '@pyreon/charts'

function SafeChart() {
  const chart = useChart(() => ({
    series: [{ type: 'bar', data: chartData() }],
  }))

  return (
    <div>
      {() =>
        chart.error() ? (
          <div class="chart-error">Failed to render chart: {chart.error()!.message}</div>
        ) : null
      }
      <div ref={chart.ref} style="height: 300px" />
    </div>
  )
}
```

The `<Chart />` component surfaces errors for you: it logs every chart error to `console.error` (in both dev and production — so deployment-time failures reach ops via browser devtools), and in **development** it renders the error message inline in the chart container instead of a blank div. In production the container stays empty (the console log still fires), so internals aren't leaked to users.

Common error scenarios:

- **Missing `tslib` alias** — the most common one. The bridge detects the canonical tslib symptom and re-throws with a message telling you to add `chartsViteAlias()` (see [Required Vite setup](#required-vite-setup-tslib-alias)).
- **Zero-height container** — ECharts requires a sized container; with no height the chart is invisible.
- **Invalid option** — a malformed option passed to `setOption`.
- **Network failure** loading a lazy ECharts chunk — transient; not cached as a permanent failure, so a retry can recover.

## API Reference

### Exports — `@pyreon/charts`

| Export                          | Kind      | Description                                                                                   |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `useChart`                      | hook      | `<TOption extends EChartsOption = EChartsOption>(optionsFn: () => TOption, config?: UseChartConfig) => UseChartResult`. Reactive ECharts instance with lazy module loading, signal-tracked options, auto-resize, error capture, and cleanup. |
| `Chart`                         | component | `<TOption extends EChartsOption = EChartsOption>(props: ChartProps<TOption>) => VNodeChild`. Declarative chart component built on `useChart` with event binding and inline error display. |
| `EChartsOption`                 | type      | The broad ECharts option type (re-export).                                                    |
| `ComposeOption`                 | type      | ECharts helper to compose a strict option type from a series/component union (re-export).     |
| `ECharts`                       | type      | The ECharts instance type (re-export from `echarts/core`).                                    |
| `SetOptionOpts`                 | type      | Options for ECharts' `setOption` (re-export).                                                  |
| `ChartProps`                    | type      | Props for `<Chart />` (`options`, `style`, `class`, `theme`, `renderer`, `locale`, `notMerge`, `lazyUpdate`, `onInit`, `onClick`, `onMouseover`, `onMouseout`). |
| `ChartEventParams`              | type      | Duck-typed shape passed to event handlers (`name`, `value`, `seriesIndex`, `dataIndex`, …).   |
| `UseChartConfig`                | type      | Second argument to `useChart` — see [Configuration](#configuration).                          |
| `UseChartResult`                | type      | Return type of `useChart` (`ref`, `instance`, `loading`, `error`, `resize`).                  |
| `BarSeriesOption`               | type      | ECharts bar series option (re-export).                                                        |
| `LineSeriesOption`              | type      | ECharts line series option (re-export).                                                       |
| `PieSeriesOption`               | type      | ECharts pie series option (re-export).                                                        |
| `ScatterSeriesOption`           | type      | ECharts scatter series option (re-export).                                                    |
| `RadarSeriesOption`             | type      | ECharts radar series option (re-export).                                                      |
| `HeatmapSeriesOption`           | type      | ECharts heatmap series option (re-export).                                                    |
| `TreemapSeriesOption`           | type      | ECharts treemap series option (re-export).                                                    |
| `TreeSeriesOption`              | type      | ECharts tree series option (re-export).                                                       |
| `SunburstSeriesOption`          | type      | ECharts sunburst series option (re-export).                                                   |
| `SankeySeriesOption`            | type      | ECharts sankey series option (re-export).                                                     |
| `GaugeSeriesOption`             | type      | ECharts gauge series option (re-export).                                                      |
| `FunnelSeriesOption`            | type      | ECharts funnel series option (re-export).                                                     |
| `CandlestickSeriesOption`       | type      | ECharts candlestick series option (re-export).                                                |
| `BoxplotSeriesOption`           | type      | ECharts boxplot series option (re-export).                                                    |
| `GraphSeriesOption`             | type      | ECharts graph series option (re-export).                                                      |
| `TitleComponentOption`          | type      | ECharts title component option (re-export).                                                   |
| `TooltipComponentOption`        | type      | ECharts tooltip component option (re-export).                                                 |
| `LegendComponentOption`         | type      | ECharts legend component option (re-export).                                                   |
| `GridComponentOption`           | type      | ECharts grid component option (re-export).                                                     |
| `ToolboxComponentOption`        | type      | ECharts toolbox component option (re-export).                                                 |
| `DataZoomComponentOption`       | type      | ECharts dataZoom component option (re-export).                                                 |
| `VisualMapComponentOption`      | type      | ECharts visualMap component option (re-export).                                                |

### Exports — `@pyreon/charts/manual`

| Export                                | Kind      | Description                                                                       |
| ------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `useChart`                            | hook      | Same hook as the default entry, but with **no** auto-detection — you register modules via `use()`. |
| `Chart`                               | component | Same component as the default entry, with no auto-detection.                      |
| `use`                                 | function  | `(...modules: unknown[]) => void`. Variadic ECharts module registration (`echarts/core`'s `use`). Call once at startup. |
| `EChartsOption` / `UseChartConfig` / `UseChartResult` / `ChartProps` | type | Re-exported for convenience. |

### Exports — `@pyreon/charts/vite`

| Export             | Kind     | Description                                                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `chartsViteAlias`  | function | `(fromDir?: string) => Record<string, string>`. Returns a `resolve.alias` entry mapping `tslib` to the flat-ESM `tslib.es6.js`. Spread into `resolve.alias`. Returns `{}` if tslib can't be located. |

:::warning[Common mistakes]
- **Passing options as a plain object** instead of a function — signal reads aren't tracked and the chart never updates. Always `() => ({ ... })`.
- **Forgetting a height** on the container — ECharts measures the container; a zero-height div renders an invisible chart.
- **Reading `chart.instance()` immediately** after `useChart` — it's `null` until the async module load completes; gate on `chart.loading()` first.
- **Skipping the `tslib` Vite alias** — every chart silently renders as an empty div with a `__extends` destructure error.
- **Calling `registerModules([...])` on the manual entry** — there is no such export; the registration function is the variadic `use(...)`.
:::
