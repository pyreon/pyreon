---
title: Plot Engine
description: The first-party chart engine — tree-shakeable marks, pure geometry, canvas + SVG backends, and a generated native twin.
---

`@pyreon/charts/plot` is Pyreon's **own chart engine**. It has zero runtime
dependencies: geometry is computed in pure TypeScript into a flat draw list,
which a tiny canvas host paints in the browser and a pure string builder
serializes on the server. Marks are **imported bindings**, so an unused chart
type tree-shakes out of your bundle like any unused function.

The main `@pyreon/charts` entry remains the [ECharts bridge](/docs/charts) —
reach for that when you need the long tail of ECharts series types today.
Reach for `/plot` when you want a small, fast, dependency-free chart that
renders identically on the server, hydrates nothing it doesn't need, and
shares its geometry with the native (SwiftUI/Compose) runtimes.

<PackageBadge name="@pyreon/charts" href="/docs/charts-plot" />

## Quick start

```tsx
// @check
import { signal } from '@pyreon/reactivity'
import { PlotChart, bars, line, currency } from '@pyreon/charts/plot'

type Row = { month: string; revenue: number; target: number }

const rows = signal<Row[]>([
  { month: 'Jan', revenue: 3200, target: 3000 },
  { month: 'Feb', revenue: 4100, target: 3400 },
  { month: 'Mar', revenue: 3800, target: 3800 },
])

export const Revenue = () => (
  <PlotChart
    data={() => rows()}
    x={(d: Row) => d.month}
    marks={[
      bars((d: Row) => d.revenue, { label: 'Revenue', color: '#6366f1' }),
      line((d: Row) => d.target, { label: 'Target', color: '#f59e0b' }),
    ]}
    format={currency('$')}
    title="Monthly revenue vs target"
    showLegend
    tooltip
  />
)
```

`data` accepts a plain array (static) or an accessor (reactive) — signal reads
inside the accessor are tracked, so a `rows.set(...)` repaints the chart with
no other wiring.

## Marks

A mark pairs a value accessor `(d, index) => number` with paint options. They
draw in array order.

| Mark | Draws |
| --- | --- |
| `bars(y, options?)` | Vertical bars from the zero line. |
| `line(y, options?)` | A polyline through the values. |
| `area(y, options?)` | A filled area under the line. |
| `points(y, options?)` | Discrete points. |
| `stackedBars(y, options?)` | One stack segment per mark — combine several. |
| `groupedBars(y, options?)` | Side-by-side bars per category. |
| `bubble(y, r, options?)` | Points with a per-datum radius channel. |

Options (`MarkOptions`): `label` (legend/tooltip/a11y name), `color`, `width`
(stroke), `radius` (points), `showValues` (value labels above bars), and
`curve` — an imported interpolator, not a string:

```tsx
// @check
import { PlotChart, area, smooth, step } from '@pyreon/charts/plot'

const readings = [3, 7, 4, 9, 6]

export const Curves = () => (
  <PlotChart
    data={readings}
    marks={[
      area((d: number) => d, { curve: smooth, label: 'Smoothed' }),
      area((d: number) => d, { curve: step, label: 'Stepped' }),
    ]}
  />
)
```

## Axes

- **Categorical x** — pass `x={(d) => d.label}`; points are spaced evenly.
- **Continuous x** — pass `xValue={(d) => d.timestamp}`; spacing follows the
  values, which is a correctness feature: readings on Jan 1, Jan 2 and Mar 1
  drawn evenly spaced would claim the first gap equals the second.
- **Time axis** — add `xTime` when `xValue` returns epoch milliseconds to get
  calendar tick labels; override with `xFormat`.
- **Horizontal bars** — `horizontal` flips the frame (categories on Y, bars
  growing rightward). Bar-family marks only; the left gutter sizes itself from
  the widest category label, which is the reason horizontal bars exist.

One `format` formatter applies to the y axis, the tooltip and the accessible
description — an axis that says `$3.2K` beside a tooltip that says `3204.55`
reads as a bug. `plain`, `fixed`, `percent`, `currency` and `compact` ship in
the same subpath; any `(v: number) => string` works.

## Radial charts

```tsx
// @check
import { PieChart, GaugeChart } from '@pyreon/charts/plot'

const share = [
  { browser: 'Chrome', pct: 65 },
  { browser: 'Safari', pct: 19 },
  { browser: 'Firefox', pct: 8 },
]

export const Radials = () => (
  <>
    <PieChart
      data={share}
      value={(d) => d.pct}
      label={(d) => d.browser}
      innerRadius={0.6}
      showLegend
      title="Browser share"
    />
    <GaugeChart value={0.72} max={1} showValue title="Capacity" />
  </>
)
```

`innerRadius={0}` is a pie; anything up to 1 is a donut.

## Finance and matrix charts

```tsx
// @check
import { CandlestickChart, HeatmapChart } from '@pyreon/charts/plot'

const ohlc = [
  { day: 'Mon', o: 102, h: 108, l: 99, c: 106 },
  { day: 'Tue', o: 106, h: 111, l: 104, c: 105 },
]

const commits = [
  { dow: 'Mon', hour: '09', n: 4 },
  { dow: 'Mon', hour: '10', n: 7 },
  { dow: 'Tue', hour: '09', n: 2 },
]

export const Finance = () => (
  <>
    <CandlestickChart
      data={ohlc}
      x={(d) => d.day}
      open={(d) => d.o}
      high={(d) => d.h}
      low={(d) => d.l}
      close={(d) => d.c}
      title="Weekly OHLC"
    />
    <HeatmapChart
      data={commits}
      x={(d) => d.hour}
      y={(d) => d.dow}
      value={(d) => d.n}
      title="Commits by hour"
    />
  </>
)
```

Duplicate `(x, y)` heatmap observations **sum** — feed raw event rows straight
in without pre-aggregating.

## Annotations and animation

`annotations` draws reference rules and bands (the target line, the healthy
range) between the grid and the series. `animate` (on by default) plays an
entrance — bars rise, lines draw left-to-right — and turns itself off under
`prefers-reduced-motion`. Data **updates** are deliberately not animated: an
update should read as the new truth, not a morph.

Animation lives in the engine as a parameter, not in the hosts as an effect:
`renderChart` at `progress: 0.4` is a pure function returning the 40%-grown
frame, which makes every frame testable and means a native executor animates
by tweening one number.

## Accessibility

A canvas is a single opaque node to a screen reader, so every component
renders an **offscreen data table** by default (`accessibleTable={false}` to
opt out) and derives an `aria-label` from the actual data via `describeChart`.
Pass `title` to name the chart — without it the description falls back to a
bare "Chart".

## Server-side SVG

`chartToSvg` builds the same chart as a pure SVG string — no DOM, no canvas —
so it runs in SSR, SSG, an API route, or an email pipeline:

```ts
// @check
import { chartToSvg, bars, currency } from '@pyreon/charts/plot'

const svg = chartToSvg({
  data: [3200, 4100, 3800],
  marks: [bars((d: number) => d, { label: 'Revenue' })],
  format: currency('$'),
  title: 'Monthly revenue',
})
```

Text measurement defaults to a server-safe approximation; in a browser pass
`measure: canvasMeasure(ctx, font)` when label widths must be exact. Given a
`title` and no `description`, a long description is **derived from the data**
— a chart whose only accessible text is its title tells a screen-reader user
that a graphic exists and nothing about what it shows.

## Big data

`lttb` (largest-triangle-three-buckets) and `minMaxBuckets` from the same
subpath decimate large series before charting — downsampling that preserves
the visual shape (peaks and troughs) rather than averaging them away.

## Native

The engine's geometry is **generated into Swift and Kotlin twins**
(`PyreonChartEngine.swift` / `.kt` in the native runtimes) from the same
TypeScript sources, drift-locked byte-for-byte in CI and compile-proven with
the real toolchains. The flat draw-list design is what makes this possible:
a native canvas executes the same commands the web canvas does. JSX-level
lowering (writing `<PieChart>` in shared source and getting SwiftUI/Compose)
is landing chart-by-chart — see the
[multiplatform capability matrix](/docs/multiplatform) for current status.

## Choosing between `/plot` and the ECharts bridge

| | `@pyreon/charts/plot` | `@pyreon/charts` (ECharts) |
| --- | --- | --- |
| Dependencies | none | `echarts` peer |
| Bundle | pay per imported mark | lazy-loaded per chart type |
| SSR | pure-string SVG | client-only render |
| Native | shared generated geometry | web-only |
| Series breadth | growing first-party set | the full ECharts catalog |
