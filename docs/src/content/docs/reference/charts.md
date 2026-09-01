---
title: "Two charting engines — API Reference"
description: "Reactive ECharts bridge, plus Pyreon's own tree-shakeable engine with canvas and SVG backends"
---

# @pyreon/charts — API Reference

> **Generated** from `charts`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [charts](/docs/charts).

Two independent charting engines behind two subpaths. `@pyreon/charts/plot` is Pyreon's OWN: pure-TypeScript geometry over a flat draw list, marks as imported bindings so tree-shaking is structural, a canvas backend, and a PURE SVG backend that renders on a server. `@pyreon/charts` is the ECharts bridge: zero ECharts bytes in your bundle until a chart actually renders — chart types and components are auto-detected from your options and dynamically imported on demand. Signal-driven options reactively update the chart when tracked signals change. `useChart` is the low-level hook with full control; `<Chart />` is the declarative component with event binding. Both auto-resize via ResizeObserver and clean up on unmount.

## Features

- useChart&lt;TOption&gt;(optionsFn, config?) — low-level reactive hook with full lifecycle control
- Chart component with declarative options, event binding, and auto-resize
- onEvents map for ANY ECharts event (legendselectchanged, datazoom, brushselected, …), leak-safe binding
- showLoading — reactive toggle of the ECharts loading overlay
- Zero-byte lazy loading — chart types auto-detected and dynamically imported
- Generic TOption for strict typed options via ComposeOption&lt;SeriesUnion&gt;
- @pyreon/charts/manual entry for explicit tree-shaking control
- All ECharts option and series types re-exported for single-import convenience

## Complete example

A full, end-to-end usage of the package:

```tsx
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
      {chart.loading() ? 'Loading chart...' : null}
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
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useChart`](#usechart) | hook | Create a reactive ECharts instance. |
| [`Chart`](#chart) | component | Declarative chart component that wraps `useChart` internally. |
| [`PlotChart`](#plotchart) | component | Pyreon's OWN charting engine, from the `@pyreon/charts/plot` subpath — no ECharts, no third-party engine. |
| [`chartToSvg`](#charttosvg) | function | Render a chart to a standalone `<svg>` STRING. |
| [`PieChart`](#piechart) | component | Pie and donut from the same engine (`@pyreon/charts/plot`); `innerRadius` is what makes it a donut. |
| [`CandlestickChart`](#candlestickchart) | component | Candlestick chart from the plot engine (`@pyreon/charts/plot`) — open/high/low/close accessors per datum, direction enco |
| [`HeatmapChart`](#heatmapchart) | component | Heatmap from the plot engine (`@pyreon/charts/plot`): two categorical axes, a value per cell, color as the third channel |
| [`RadarChart`](#radarchart) | component | Radar (spider) chart from the plot engine (`@pyreon/charts/plot`) — one polygon per datum over shared spokes. |

## API

### useChart `hook`

```ts
<TOption extends EChartsOption = EChartsOption>(optionsFn: () => TOption, config?: UseChartConfig) => UseChartResult
```

Create a reactive ECharts instance. Options are passed as a function — signal reads inside are tracked and the chart updates automatically when any tracked signal changes. Lazy-loads the required ECharts modules on first render (zero bytes until mount). Returns `ref` (bind to a container div), `instance` (Signal&lt;ECharts | null&gt;), `loading` (Signal&lt;boolean&gt;), `error` (Signal&lt;Error | null&gt;), and `resize()`. Auto-resizes via ResizeObserver (`autoresize: false | { throttle }` to opt out/throttle) and disposes on unmount. `theme` accepts an accessor for reactive swaps; `initOptions` passes through to `core.init`; warm mounts (modules cached) are synchronous. `getCore()`/`connect()` are exported for `registerMap`/`registerTheme`/linked charts.

**Example**

```tsx
const chart = useChart(() => ({
  xAxis: { type: 'category', data: months() },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: revenue() }],
}))

<div ref={chart.ref} style="height: 400px" />
// chart.loading() — true until ECharts modules loaded + chart initialized
// chart.instance() — raw ECharts instance for imperative API
```

**Common mistakes**

- Forgetting to set a height on the container div — ECharts requires explicit dimensions, it does not auto-size to content
- Passing options as a plain object instead of a function — signal reads are not tracked and the chart never updates
- Reading chart.instance() immediately after useChart — the instance is null until the async module load completes; check chart.loading() first
- Calling chart.resize() during SSR — useChart is browser-only; the hook no-ops safely on the server but resize is meaningless

**See also:** `Chart`

---

### Chart `component`

```ts
(props: ChartProps) => VNodeChild
```

Declarative chart component that wraps `useChart` internally. Accepts `options` (reactive function), `style`/`class` for the container, and event handlers. `onEvents` binds ANY ECharts event by name (`legendselectchanged`, `datazoom`, `finished`, …), with `onClick`/`onMouseover`/`onMouseout` as shorthands — binding is leak-safe (handler changes swap listeners, all removed on unmount). `showLoading` reactively toggles the ECharts loading overlay. Renders a div with the chart — auto-resizes and cleans up on unmount. Simpler than useChart for most use cases.

**Example**

```tsx
<Chart
  options={() => ({
    legend: {},
    series: [{ type: 'pie', data: [{ value: 60, name: 'A' }, { value: 40, name: 'B' }] }],
  })}
  style="height: 300px"
  showLoading={isFetching()}
  onEvents={{
    legendselectchanged: (p) => console.log('toggled', p.name),
    datazoom: (_p, instance) => syncOtherChart(instance.getOption()),
  }}
/>
```

**Common mistakes**

- Missing style height on the Chart component — same as useChart, ECharts requires explicit container dimensions
- Passing a static options object — wrap in `() => ({...})` so signal reads inside are tracked reactively
- Using onClick/onMouseover/onMouseout for a non-mouse event — those are only shorthands; reach for the general `onEvents` map (e.g. `onEvents={{ legendselectchanged: fn }}`) for any other ECharts event
- Passing `theme` as a plain VALUE and expecting runtime swaps — a value is applied once at init; pass an ACCESSOR (`theme: () => (dark() ? 'dark' : null)`) and a flip disposes + re-inits with the option, group, and events preserved
- Relying on the default merge when data shrinks — a signal change that removes a series/point leaves the old one; pass `notMerge` or `replaceMerge="series"`

**See also:** `useChart`

---

### PlotChart `component`

```ts
<T>(props: PlotChartProps<T>) => VNodeChild
```

Pyreon's OWN charting engine, from the `@pyreon/charts/plot` subpath — no ECharts, no third-party engine. Marks are IMPORTED BINDINGS (`bars`, `line`, `area`, `points`, `stackedBars`, `groupedBars`), so tree-shaking is structural rather than a build flag: a bar chart never pulls the radial trigonometry, the decimation or the time scales. Geometry is pure TypeScript over plain data and the platform half is a short backend that walks a flat `DrawCmd[]`, which is why the same source is the path to native rendering. Renders to canvas with a device-pixel-ratio-correct surface; `showLegend`, `tooltip`, `crosshair` and a title are opt-in props, and width falls back to the container's own so a chart in a flexible column fills it. The legend is INTERACTIVE by default: clicking an entry toggles its series, the domain rescales to what is visible, and hidden entries render muted (`legendToggle: false` opts out).

**Example**

```tsx
import { PlotChart, bars, line } from '@pyreon/charts/plot'
import { signal } from '@pyreon/reactivity'

interface Row { month: string; revenue: number; target: number }
const sales = signal<Row[]>([{ month: 'Jan', revenue: 120, target: 100 }])

<PlotChart
  data={() => sales()}
  x={(d: Row) => d.month}
  marks={[bars((d: Row) => d.revenue), line((d: Row) => d.target)]}
  showLegend
  tooltip
  title="Monthly revenue"
  height={240}
/>
```

**Common mistakes**

- Importing from `@pyreon/charts` instead of `@pyreon/charts/plot` — the default entry is the ECharts bridge; the two engines are separate subpaths and mixing them pulls ECharts back into the bundle
- Passing `marks` as a string type name — a mark is an imported FUNCTION, which is exactly what makes the unused ones droppable; there is no string-keyed registry to tree-shake around
- Expecting two series to be told apart without a legend — colours come from a per-series palette, but `showLegend` is opt-in and a chart with neither legend nor tooltip is unlabelled
- Reaching for `tooltip` on a static chart in a report — it installs pointer handlers and a DOM overlay, which is why it is off by default
- Passing a curve as a string (`curve: "smooth"`) — a curve is an imported BINDING (`import { smooth }`), like a mark, which is what lets an unused one tree-shake; there is no string registry
- Animating in the host with CSS or rAF hacks — the engine takes `progress` (0..1) and returns that frame pure; `<PlotChart>` already tweens it on first paint and respects `prefers-reduced-motion`
- Adding `line` or `points` marks to a `horizontal` chart and wondering where they went — the horizontal frame is bar-family only (a horizontal line chart is a transposed coordinate system, a different chart), so non-bar marks are skipped
- Spacing an irregular time series by index — without `xValue` the points sit at even thirds whatever their timestamps, so the chart claims gaps that are not there; pass `xValue={(d) => d.at}` and `xTime` for calendar tick labels
- Leaving `format` unset on a money or percentage chart — the default prints the raw number, so a revenue axis reads `3200000`; `currency`, `percent`, `compact` and `fixed` ship in the same subpath and one `format` covers the axis, the tooltip and the spoken description at once
- Reading a rescaled axis as a data change after a legend toggle — hiding a dominant series RESCALES the domain to the visible ones (that is the point: it is how you read the small series); the accessible table still carries every series
- Expecting `crosshair` on a `horizontal` chart — the pointer sweeps rows there and a vertical rule would mislead, so it is a documented no-op; the tooltip still works

**See also:** `chartToSvg` · `PieChart`

---

### chartToSvg `function`

```ts
<T>(options: ChartToSvgOptions<T>) => string
```

Render a chart to a standalone `<svg>` STRING. Pure — no DOM, no canvas, no measurement context — so it runs in an SSG build, a serverless function or an email pipeline, where a canvas surface does not exist. Output is deterministic (coordinates rounded to two decimals, negative zero normalised), which makes an SVG snapshot a real assertion about geometry rather than a pixel flake. Labels are XML-escaped. The `<svg>` is `role="img"` named by its `<title>`; given a title and no description, the long form is DERIVED from the data via `describeChart`. Text width comes from `measureApprox` by default — an honest estimate, since a server has no font metrics; pass `canvasMeasure(ctx, font)` in a browser when label widths must be exact. The whole family has the same one-call form: `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg`, `heatmapToSvg` — every chart type the engine draws renders on a server.

**Example**

```tsx
import { chartToSvg, bars } from '@pyreon/charts/plot'

interface Row { month: string; revenue: number }
const rows: Row[] = [{ month: 'Jan', revenue: 120 }]

const svg = chartToSvg({
  data: rows,
  marks: [bars((d: Row) => d.revenue)],
  x: (d: Row) => d.month,
  title: 'Monthly revenue',
})
// -> '<svg xmlns="..." role="img" aria-labelledby=...>...</svg>'
```

**Common mistakes**

- Expecting exact label widths on a server — `measureApprox` estimates from glyph counts; axis gutters have slack so a few percent moves nothing visible, but do not use it for tight text layout
- Passing a title and assuming that is enough for a screen reader — a graphic whose only accessible text is its name says a chart exists and nothing about what it shows; leave `description` unset to get the derived one, or write your own
- Rendering several charts into one page without changing `svg.idPrefix` — the `<title>`/`<desc>` ids collide and `aria-labelledby` resolves to the first one
- Reaching for it to get a PNG — it emits vector markup; rasterize with the canvas backend (`paint`) or a downstream converter

**See also:** `PlotChart`

---

### PieChart `component`

```ts
(props: PieChartProps) => VNodeChild
```

Pie and donut from the same engine (`@pyreon/charts/plot`); `innerRadius` is what makes it a donut. `GaugeChart` is its sibling for a single value against a range. Both carry the same accessibility contract as `PlotChart` — a `role="img"` graphic with a derived description — rather than being a decorative canvas with no accessible text.

**Example**

```tsx
import { PieChart, GaugeChart } from '@pyreon/charts/plot'
import { signal } from '@pyreon/reactivity'

interface Slice { name: string; amount: number }
const slices = signal<Slice[]>([{ name: 'Direct', amount: 40 }])
const cpu = signal(42)

<PieChart data={() => slices()} label={(d: Slice) => d.name} value={(d: Slice) => d.amount} innerRadius={0.6} />
<GaugeChart value={() => cpu()} min={0} max={100} title="CPU" />
```

**Common mistakes**

- Using a pie for more than a handful of slices — angular area is hard to compare; the engine will draw it, which is not the same as it reading well
- Omitting `label` and expecting a legend — the slice labels are what name the data

**See also:** `PlotChart`

---

### CandlestickChart `component`

```ts
<T>(props: CandlestickChartProps<T>) => VNodeChild
```

Candlestick chart from the plot engine (`@pyreon/charts/plot`) — open/high/low/close accessors per datum, direction encoded by color (close vs open; up green, down red by default, both overridable). `onSelect` fires with the candle index (the full COLUMN is the hit target — a wick is one pixel wide) and `tooltip` shows the hovered period OHLC. A doji (open == close) keeps a 1px body — flat trading is a fact, and a missing candle reads as missing data. The wick draws first so the body sits over it; the price domain is niced so the axis lands on readable ticks. Geometry (`renderCandles`, `ohlcExtent`) exported standalone.

**Example**

```tsx
import { CandlestickChart } from '@pyreon/charts/plot'

interface Bar { day: string; o: number; h: number; l: number; c: number }
const bars: Bar[] = [{ day: 'Mon', o: 10, h: 20, l: 5, c: 15 }]

<CandlestickChart data={bars} open={(d: Bar) => d.o} high={(d: Bar) => d.h} low={(d: Bar) => d.l} close={(d: Bar) => d.c} x={(d: Bar) => d.day} />
```

**Common mistakes**

- Feeding pre-sorted-descending periods and reading the chart right-to-left — periods render in DATA order, oldest first by convention; sort ascending
- Expecting volume bars — volume is a second chart sharing the x axis, not a candle option; compose a `PlotChart` with `bars` below it
- Aiming a click at the candle body — the hit target is the whole COLUMN, deliberately: a doji body is one pixel tall and selection must not be a game of skill

**See also:** `PlotChart` · `HeatmapChart`

---

### HeatmapChart `component`

```ts
<T>(props: HeatmapChartProps<T>) => VNodeChild
```

Heatmap from the plot engine (`@pyreon/charts/plot`): two categorical axes, a value per cell, color as the third channel. Category order is FIRST-SEEN (weekday names and funnel stages carry an order alphabetical sorting destroys); duplicate (x, y) observations SUM; absent cells are NOT drawn — absence and zero are different facts. The ramp is plain `#rrggbb` stops interpolated by hand-rolled math, so the same code lowers to native. The row gutter sizes itself from the widest row label, the same rule horizontal bars use. `onSelect` fires with the tapped CELL (its categories and aggregated value; null for a miss) and `tooltip` shows row · column: value — both speak in cells because duplicate observations SUM into one cell, so the cell is the unit on screen.

**Example**

```tsx
import { HeatmapChart } from '@pyreon/charts/plot'

interface Ev { day: string; hour: string; count: number }
const events: Ev[] = [{ day: 'Mon', hour: '09', count: 12 }]

<HeatmapChart data={events} x={(d: Ev) => d.day} y={(d: Ev) => d.hour} value={(d: Ev) => d.count} />
```

**Common mistakes**

- Expecting alphabetically sorted axes — category order is first-seen from the data, which is what keeps Mon..Sun in week order; sort the DATA to sort the axes
- Reading an undrawn cell as zero — absent cells are skipped, not painted cold; emit explicit zero observations when zero is a fact worth showing
- Passing a color ramp as anything but `#rrggbb` stops — named colors and rgb() strings are not parsed; the hex restriction is what lets the ramp math lower to native
- Expecting `onSelect` to fire a datum index — duplicate (x, y) observations SUM into one cell, so the callback speaks in cells: categories plus the aggregated value, or null for a miss (an undrawn cell is a miss too: absence is not selectable)

**See also:** `PlotChart` · `PieChart`

---

### RadarChart `component`

```ts
<T>(props: RadarChartProps<T>) => VNodeChild
```

Radar (spider) chart from the plot engine (`@pyreon/charts/plot`) — one polygon per datum over shared spokes. Each axis normalises by its OWN max, so axes in different units (revenue beside a score out of 5) are comparable on one chart; a shared scale would flatten every small-range axis to the centre. Fewer than three axes draws nothing (no area to enclose). The fill is translucent (`fillAlpha`, default 0.25) with a full-strength outline, so overlapping polygons stay readable. Geometry (`renderRadar`, `radarPolygon`, `radarAngles`) exported standalone.

**Example**

```tsx
import { RadarChart } from '@pyreon/charts/plot'

interface Player { name: string; speed: number; power: number; skill: number }
const players: Player[] = [{ name: 'Ana', speed: 90, power: 40, skill: 80 }]

<RadarChart
  data={players}
  axes={[{ label: 'Speed', max: 100 }, { label: 'Power', max: 100 }, { label: 'Skill', max: 100 }]}
  values={(d: Player) => [d.speed, d.power, d.skill]}
  label={(d: Player) => d.name}
  showLegend
/>
```

**Common mistakes**

- Comparing absolute magnitudes across axes — each spoke normalises by its own `max`, so polygon SHAPE compares profiles, not sizes; put same-unit series on a PlotChart when magnitude is the story
- Passing `values` in a different order than `axes` — the two are index-aligned, and a swapped pair silently plots speed on the power spoke
- More than a handful of polygons — overlapping fills become unreadable past 3-4 series; filter the data or facet into several charts

**See also:** `PlotChart` · `PieChart`

---

## Package-level notes

> **Two engines, two subpaths:** The package ships TWO independent engines. `@pyreon/charts` bridges ECharts — mature, enormous chart-type coverage, browser-only. `@pyreon/charts/plot` is Pyreon's own: pure-TypeScript geometry over a flat draw list, tree-shakeable by construction, with a canvas backend and a pure SVG backend that runs on a server. Import from ONE of them; pulling a name from the default entry drags ECharts back into a bundle that had dropped it.

> **tslib Vite alias:** ECharts imports `tslib` whose ESM `./modules/index.js` entry destructures named helpers from a `__toESM(require_tslib())` default — the helpers live as top-level vars on the CJS factory, so the destructure reads `undefined` and the page throws `TypeError: Cannot destructure property "__extends"` the moment ECharts loads. Use `chartsViteAlias()` from `@pyreon/charts/vite` in your `vite.config.ts` (`resolve: { alias: { ...chartsViteAlias() } }`); it resolves `tslib` to the flat-ESM `tslib.es6.js` across install layouts. Browser tests use `tslibBrowserAlias()` from the shared test config. Tracking upstream: microsoft/tslib#189.

> **Note:** Options must be a FUNCTION `() => EChartsOption`, not a plain object. Signal reads inside the function are tracked — changing any tracked signal reactively updates the chart.

> **Lazy loading:** ECharts modules are auto-detected from your options (series types, components) and dynamically imported. First render has an async loading phase — check `loading()` or `<Chart>` handles it internally. Zero ECharts bytes in your initial bundle.

> **Manual entry:** `@pyreon/charts/manual` skips auto-detection — you register ECharts components yourself via `use()` for maximum tree-shaking control.

> **Events:** `onEvents` is the general handler map — any ECharts event by name (`legendselectchanged`, `datazoom`, `brushselected`, `finished`, …); each handler gets `(params, instance)`. `onClick`/`onMouseover`/`onMouseout` are shorthands merged in (they WIN on a key collision). Binding is leak-safe: a changed handler swaps the listener (no pile-up) and all are removed on unmount.

> **Theme is not reactive:** Reactive theme: pass `theme` as an ACCESSOR (`() => (dark() ? 'dark' : null)`) — a flip disposes + re-inits with the current option/group/events preserved (ECharts has no in-place swap; dispose+re-init is the mechanism, as in vue-echarts). A plain value stays static. For map charts, `await getCore()` then `core.registerMap(...)` BEFORE rendering a `map` series.
