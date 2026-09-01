---
title: Plot Engine
description: Pyreon's own charting engine — pure-TypeScript geometry, structural tree-shaking, a canvas backend, and an SVG backend that renders on the server.
---

`@pyreon/charts/plot` is Pyreon's **own** charting engine. It shares a package with the [ECharts bridge](/docs/charts) and nothing else — no shared runtime, no shared bundle. Importing one never pulls in the other.

<PackageBadge name="@pyreon/charts" href="/docs/charts-plot" />

Reach for it when you want charts that:

- **cost only what you draw.** Marks are imported bindings, so an unused `area` tree-shakes the way an unused function does. There is no registry and no string-keyed switch that defeats a bundler.
- **render without a browser.** `chartToSvg` is pure geometry plus string building — it runs in SSR, in SSG, in a worker, in a report generator. No canvas, no DOM, no `window`.
- **ship no third-party bytes.** The geometry is TypeScript in this repo. Nothing in this subpath imports ECharts, so none of it reaches your bundle.

Reach for the [ECharts bridge](/docs/charts) instead when you want the breadth of ECharts' chart types (sankey, treemap, graph, map, themeRiver …) and are happy to pay for a lazily-loaded third-party engine.

## Installation

```bash
bun add @pyreon/charts
```

No Vite alias — the `tslib` alias the ECharts bridge needs is **not** required here, because nothing in this subpath imports ECharts.

:::note{title="`echarts` is still a package-level peer"}
`@pyreon/charts` declares `echarts` as a peer dependency for the whole package, so your package manager will ask for it even in a plot-only app. It is never *imported* by this subpath, so it contributes nothing to your bundle — but the install-time warning is real, and installing `echarts` silences it.
:::

## Quick start

A chart is **data + marks**. The marks are functions you import and call; each one binds an accessor to a series.

```tsx
import { PlotChart, bars } from '@pyreon/charts/plot'

const revenue = [
  { month: 'Jan', amount: 120 },
  { month: 'Feb', amount: 240 },
  { month: 'Mar', amount: 180 },
]

<PlotChart
  data={revenue}
  x={(d) => d.month}
  marks={[bars((d) => d.amount, { label: 'Revenue' })]}
  height={280}
/>
```

`x` names the category for each datum. Omit it for a numeric axis.

<Example file="./examples/charts/plot-marks" title="Marks, reactivity and formatting" />

The demo above is the real engine: marks compose in paint order, `data` is an accessor so the chart repaints when the signal changes, and one `format` feeds the axis, the tooltip and the accessible description together.

## Reactivity

`data` takes either a plain array (static) or an **accessor** (reactive). An accessor is read inside a tracking scope, so the chart repaints when any signal it reads changes — the same contract as everywhere else in Pyreon.

```tsx
import { signal } from '@pyreon/reactivity'
import { PlotChart, line } from '@pyreon/charts/plot'

const readings = signal([{ t: 0, v: 12 }])

<PlotChart
  data={() => readings()}
  marks={[line((d) => d.v)]}
/>
```

Passing `data={readings()}` instead reads the signal once, at setup, and the chart never updates — the [reactive-vs-static rule](/docs/reactivity-rules) applies here exactly as it does to any other prop.

## Marks

Every mark is `mark(accessor, options?)`. The accessor is `(datum, index) => number`.

| Mark | Draws |
| --- | --- |
| `bars` | Vertical bars, one per datum. |
| `stackedBars` | Bars stacked on the previous stacked series. |
| `groupedBars` | Bars placed side by side within each category. |
| `line` | A polyline through the points. |
| `area` | A filled region between the line and the baseline. |
| `points` | A scatter dot per datum. |
| `bubble` | A scatter dot whose radius is a second accessor. |

Marks compose in **paint order** — earlier marks draw first, so a later `line` sits on top of an earlier `area`.

```tsx
import { PlotChart, area, line, points } from '@pyreon/charts/plot'

<PlotChart
  data={series}
  x={(d) => d.day}
  marks={[
    area((d) => d.value, { color: '#dbeafe' }),
    line((d) => d.value, { color: '#2563eb', width: 2 }),
    points((d) => d.value, { color: '#2563eb', radius: 3 }),
  ]}
/>
```

### Mark options

| Option | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Name in the legend, tooltip and accessible table. |
| `color` | `string` | Series colour. Defaults come from the theme. |
| `width` | `number` | Stroke width for `line` and `area` outlines. |
| `radius` | `number` | Point radius for `points`. |
| `curve` | `(points) => points` | `smooth` or `step`, both importable from the same subpath. |
| `showValues` | `boolean` | Draw each value above its bar. Off by default — value labels on a dense series overlap into noise. |

`curve` takes an **imported binding**, not a string, so an unused curve tree-shakes like an unused mark:

```tsx
import { line, smooth } from '@pyreon/charts/plot'

line((d) => d.value, { curve: smooth })
```

## `<PlotChart>` props

| Prop | Type | Notes |
| --- | --- | --- |
| `data` | `T[] \| (() => T[])` | An accessor makes it reactive. |
| `marks` | `Mark<T>[]` | In paint order. |
| `x` | `(d, i) => string` | Category label. Omit for a numeric axis. |
| `xValue` | `(d, i) => number` | Per-datum position on a **continuous** axis. |
| `width` / `height` | `number` | Falls back to the container, observed for resize. |
| `theme` | `Partial<ChartTheme>` | Axis, grid and series colours. |
| `showXAxis` / `showYAxis` / `showGrid` | `boolean` | Default on. |
| `showLegend` | `boolean` | Uses each mark's `label`. |
| `tooltip` | `boolean` | **Off by default** — it installs pointer handlers and a DOM overlay a static chart has no use for. |
| `onSelect` | `(index: number) => void` | Fires with the datum index, or `-1` for a miss. |
| `title` | `string` | Names the chart for assistive technology and titles the data table. |
| `seriesLabels` | `string[]` | Labels for legend, tooltip and accessible table. |
| `format` | `Formatter` | Formats y-axis ticks, tooltip values and the description. |
| `class` | `string` | Applied to the wrapper. |

### `xValue` is a correctness feature, not a styling one

Without `xValue`, points are spaced evenly by index. That is right for a categorical axis and **misstates an irregular one**: readings on Jan 1, Jan 2 and Mar 1 drawn at even spacing claim the first gap equals the second.

```tsx
<PlotChart
  data={() => readings()}
  xValue={(d) => d.timestamp}   // epoch ms
  marks={[line((d) => d.value)]}
/>
```

Bars stay categorical either way — bars on a continuous axis need a width in domain units, which is a different chart.

## Formatting

One formatter feeds the axis, the tooltip and the accessible description. That is deliberate: an axis reading `$3.2K` beside a tooltip reading `3204.55` for the same point reads as a bug.

```tsx
import { PlotChart, bars, currency, percent, compact, fixed } from '@pyreon/charts/plot'

<PlotChart data={revenue} marks={[bars((d) => d.amount)]} format={currency('$')} />
```

| Formatter | Output |
| --- | --- |
| `plain` | Default. Trims float noise and prints the number. |
| `compact` | `3.2K`, `1.4M`. |
| `fixed(places)` | Fixed decimal places. |
| `currency(symbol, places?)` | `$3200`, `-$12.50`. |
| `percent(places?)` | Multiplies by 100 and appends `%`. |

Any `(v: number) => string` works. The default is right for counts and **wrong for money and percentages** — a revenue axis reading `3200000` is the first thing anyone notices.

## The specialty charts

Four charts that are not a marks-and-axes plot ship as their own components.

### `<PieChart>` and `<GaugeChart>`

```tsx
import { PieChart, GaugeChart } from '@pyreon/charts/plot'

<PieChart
  data={spend}
  value={(d) => d.amount}
  label={(d) => d.category}
  innerRadius={0.6}          // 0 for a pie, 0..1 for a donut hole
  showLegend
  title="Spend by category"
/>

<GaugeChart value={() => load()} min={0} max={100} showValue title="CPU load" />
```

`GaugeChart` takes `value` as a number **or** an accessor, so it animates from a signal without a wrapper.

### `<HeatmapChart>`

```tsx
import { HeatmapChart } from '@pyreon/charts/plot'

<HeatmapChart
  data={events}
  x={(d) => d.weekday}
  y={(d) => d.hour}
  value={(d) => d.count}
  title="Activity by hour"
/>
```

Duplicate `(x, y)` observations **sum**, so you can feed it raw events rather than a pre-aggregated grid.

### `<CandlestickChart>`

```tsx
import { CandlestickChart } from '@pyreon/charts/plot'

<CandlestickChart
  data={ohlc}
  x={(d) => d.date}
  open={(d) => d.o}
  high={(d) => d.h}
  low={(d) => d.l}
  close={(d) => d.c}
  title="AAPL"
/>
```

## Rendering on the server

`chartToSvg` produces a complete SVG string from pure geometry. No canvas, no DOM — it runs anywhere JavaScript does.

```ts
import { chartToSvg, bars, currency } from '@pyreon/charts/plot'

const svg = chartToSvg({
  data: revenue,
  x: (d) => d.month,
  marks: [bars((d) => d.amount)],
  width: 640,
  height: 320,
  format: currency('$'),
})
```

This is what makes a chart work in an SSG page with JavaScript disabled, in an emailed report, or in a PDF pipeline.

:::caution{title="Give each chart its own idPrefix"}
`renderSvg` accepts an `idPrefix` that namespaces the SVG's internal ids. Two charts on one page sharing a prefix produce duplicate ids, and a `<defs>` reference then resolves to whichever came first. Vary it per chart.
:::

## Annotations

Reference rules and bands attach to the spec rather than to a mark:

```ts
chartToSvg({
  data,
  marks: [line((d) => d.value)],
  annotations: [
    { y: 100, label: 'Target', color: '#16a34a' },
    { yFrom: 0, yTo: 20, label: 'Danger', color: '#fecaca' },
  ],
})
```

An `Annotation` carries `y` (horizontal rule), `x` (vertical rule), or `yFrom`/`yTo` (horizontal band), plus an optional `label` and `color`.

## Accessibility

A canvas is opaque to assistive technology, so the engine derives a text description and a data table from the same spec it draws.

```ts
import { describeChart, chartTable } from '@pyreon/charts/plot'

describeChart({ title: 'Revenue', categories, series, format: currency('$') })
// → "Revenue. 1 series over 3 categories from Jan to Mar.
//    Revenue, bars: rising from $120 to $180, ranging $120 at Jan to $240 at Feb."

chartTable({ title: 'Revenue', categories, series })
// → { headers: ['Category', 'Revenue'],
//     rows: [['Jan', '120'], ['Feb', '240'], ['Mar', '180']] }
```

`<PlotChart title="…">` and `<PieChart title="…">` wire this up for you — the `title` is what names the chart and titles the derived table. Without it the description falls back to a bare `"Chart"`, so **pass `title`**.

## Large series

Two downsamplers ship for series too dense to draw honestly at pixel resolution:

```ts
import { lttb, minMaxBuckets } from '@pyreon/charts/plot'

lttb(points, 500)          // Pt[] → Pt[]: Largest-Triangle-Three-Buckets, preserves shape
minMaxBuckets(values, 500) // number[] → number[]: per-bucket min and max, preserves extremes
```

Note the two take **different inputs**: `lttb` needs `{ x, y }` points because its triangle-area criterion is two-dimensional, while `minMaxBuckets` works on a bare value series.

Pick `lttb` when the *shape* matters and `minMaxBuckets` when a spike must never vanish.

## Why marks are imported bindings

A registry (`{ type: 'bar' }`) forces the bundler to keep every renderer, because it cannot prove which string arrives at runtime. Importing `bars` makes the dependency **structural**: the bundler sees exactly one mark referenced and drops the rest. That is the whole reason this engine's chart-type surface costs nothing when unused, and it is why `curve` takes `smooth` rather than `'smooth'`.

## See also

- [Charts (ECharts bridge)](/docs/charts) — the other engine in this package.
- [Reactivity rules](/docs/reactivity-rules) — why `data={rows()}` is static and `data={() => rows()}` is not.
- [SSR](/docs/ssr) and [SSG](/docs/ssg) — where `chartToSvg` earns its keep.
