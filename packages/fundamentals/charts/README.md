# @pyreon/charts

Charts for Pyreon, on the web, iOS and Android.

`<Chart>` takes your rows and marks as children. Channels are field names typed
against the row, so a typo is a compile error when the chart and its marks
know the row type (`<Chart<Row>>`, `<Bar<Row> y="revenue">`). Axes, palette, tooltip, an
accessible data table and a spoken description come without configuration. The
geometry is pure TypeScript over a flat draw list, so the same source paints a
canvas in the browser, serializes to SVG on a server, and draws natively on iOS
and Android.

| Import | What it is |
| --- | --- |
| `@pyreon/charts` | `<Chart>`, its marks, the family components, formatters, theme and linking. The stable surface. |
| `@pyreon/charts/svg` | `chartToSvg` and every `*ToSvg`: SVG strings with no DOM, for SSR and export |
| `@pyreon/charts/engine` | Every layout, hit test and draw-list builder, and the array form `<PlotChart marks>`. Not covered by the stability promise |

No entry depends on a third-party charting library.

## `<Chart>`

```tsx
import { Axis, Bar, Legend, Line, Chart, Tooltip, currency } from '@pyreon/charts'

<Chart<Row> data={rows} x="month">
  <Bar y="revenue" label="Revenue" />
  <Line y="target" label="Target" />
  <Axis y format={currency('$')} />
  <Tooltip /> <Legend />
</Chart>
```

The same grammar covers the row-array families: `<Chart data={share}><Arc value="pct" label="browser" /></Chart>` is a pie or donut, `<Stage>` a funnel, `<Cell x y value>` a heatmap, `<Candle open high low close>` a candlestick — one family per plot, and `<Chart>` renders that host. `<Label text at="max" />` marks a datum, `<Rule x>` draws a vertical reference.

Channels are field names or accessors. `<Chart<Row>>` checks its own channels
against the row; a mark checks its field names when it is given the row type
too (`<Bar<Row> y="revenue">`), since JSX cannot pass a type argument from a
parent to its children. Marks are children
and draw in order; `<Rule>` / `<Axis>` / `<Tooltip>` / `<Legend>` / `<Zoom>` declare
the rest as data. `color="region"` pivots long-format rows into one series per
value. The `<PlotChart marks={[bars(…)]}>` array form is the same spec and stays
supported; on native the compiler desugars one to the other.

No third-party engine. The geometry is pure TypeScript over plain data, and the
platform half is a short backend that walks a flat `DrawCmd[]` — which is what
makes it tree-shakeable, server-renderable, and — because every family's geometry
is written in the PMTC subset — generated verbatim into the Swift and Kotlin
runtimes (see [Native geometry](#native-geometry--the-plot-engine-on-iosandroid)).

```tsx
import { Bar, Chart, Legend, Line, Tooltip } from '@pyreon/charts'

<Chart data={() => sales()} x="month" title="Monthly revenue" height={240}>
  <Bar y="revenue" />
  <Line y="target" />
  <Tooltip /> <Legend />
</Chart>
```

**A chart family is an imported binding, not a string.** `PlotChart`,
`PieChart`, `RadarChart`, `CandlestickChart`, `HeatmapChart` and the rest are
separate modules, so a bar chart never pulls the radial trigonometry or the
finance and matrix families (locked by the repo's import budgets). WITHIN
`PlotChart` the cartesian marks share one renderer and one interaction surface
(tooltip, legend, zoom, brush, `maxPoints` decimation): a one-line chart
measures the same 40.9 KB gz as a bar + line + tooltip + legend chart — see
"Bundle size" below.

Marks: `bars`, `line`, `area`, `points`, `stackedBars`, `groupedBars`.
Components: `PlotChart`, `PieChart` (donut via `innerRadius`), `GaugeChart`.

### Curves, annotations, bubbles, labels

```tsx
import { Area, Chart, Dot, Rule, smooth } from '@pyreon/charts'

<Chart data={readings} x="day">
  <Area y="value" curve={smooth} />
  <Dot y="price" r="volume" />
  <Rule y={100} label="Target" />
  <Rule from={40} to={60} />   {/* a translucent band */}
</Chart>
```

A **curve** is an imported binding, like a mark — `smooth` (monotone cubic:
it never invents an extremum the data does not have, unlike the Catmull-Rom
family) or `step` (holds each value to the next datum — the honest shape for
prices). Under the hood a curve is a `(points) => points` densifier, which is
why it costs zero new backend work on any platform.

**Annotations** are dashed rules, translucent bands and point-to-point
segments (`x1`/`y1`/`x2`/`y2`, in data units) with optional labels, placed by
the same scale the axis is labelled with. **Markers** anchor a point at a
series' `max`, `min`, `average` (the datum nearest the mean) or a datum index.
**`bubble`** maps its r
channel by AREA, not radius — radius-proportional bubbles exaggerate the data.
**`bars(y, { showValues: true })`** labels each bar with its formatted value.
**Gradients**: a mark's `gradient: { stops, direction }` ramps its fill across
the plot (`shape: 'radial'` ramps out from its centre). **Symbols**: `points(y, { symbol: 'diamond' })` draws every datum as that
shape (rect, circle, diamond, triangle; the pictorialBar vocabulary), and
`line(y, { symbol })` draws a symbol at every datum over the line, on web,
iOS and Android.

### Entrance animation

On by default: bars rise from the zero line, lines draw left to right, points
grow. Off automatically under `prefers-reduced-motion`, and via
`animate={false}`. Only the FIRST paint animates — an update should read as
the new truth, not a morph. The mechanism is `ChartSpec.progress`, a pure
engine parameter (0..1) the host tweens, so any backend animates by tweening
one number.

### Horizontal bars

```tsx
<Chart data={teams} x="name" horizontal>
  <Bar y="headcount" />
</Chart>
```

Categories move to the Y axis and bars grow rightward — and the left gutter
sizes itself from the widest CATEGORY label, because long category names are
the reason horizontal bars exist. The value axis keeps your `format`. Bar
marks only: a horizontal line or scatter is a transposed coordinate system,
not a flipped bar chart, so non-bar marks are skipped rather than drawn
misleadingly.

### Heatmap

```tsx
import { HeatmapChart } from '@pyreon/charts/engine'

<HeatmapChart
  data={events}
  x={(d) => d.day}
  y={(d) => d.hour}
  value={(d) => d.count}
/>
```

Two categorical axes, a value per cell, color as the third channel. Category
order is FIRST-SEEN — weekday names and funnel stages carry an order that
alphabetical sorting would destroy. Duplicate `(x, y)` observations SUM.
Absent cells are not drawn: absence and zero are different facts, and
painting absence as the coldest color would conflate them. The ramp is
plain `#rrggbb` stops (`colors={['#eff6ff', '#1e40af']}`), interpolated by
hand-rolled math so the same code lowers to native.

### Candlestick

```tsx
<CandlestickChart
  data={bars}
  open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c}
  x={(d) => d.day}
/>
```

Direction by color, close vs open — up green, down red by default, both
overridable. A doji (open == close) keeps a 1px body: flat trading is a fact,
and a missing candle reads as missing data. The wick draws first so the body
sits over it. The geometry (`renderCandles`, `ohlcExtent`) is exported
standalone.

### Themes

One `ChartTheme` token map — `palette`, `background`, `surface`, `text`,
`label`, `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius`,
`enterMs`, `updateMs` — feeds every host. The mode is the framework-wide
colour mode (`<PyreonUI mode>`, or `<ColorModeProvider mode>` from
`@pyreon/core`; with neither, the page's `color-scheme`, then the OS), so a
chart under a dark `<PyreonUI>` is dark with no wiring. `<ChartThemeProvider
theme={{ palette: palettes.okabeIto }} dark={{ … }}>` styles everything below
it; the `theme` prop merges over that. `chartThemes.light` / `.dark` and the named
`palettes` (`pyreon`, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`,
`observable10`, `tableau10`, `okabeIto`, `tailwind`) are exported as data.

### Every host, one surface

The 20 family hosts share one canvas host: `title` / `subtitle` /
`showTitle`, `showLegend`, `tooltip`, `animate`, `theme`, `onSelect` (the
family's rich hit) and `onSelectIndex` (the engine's index — what the native
tap reports) mean the same thing on every one of them. Bars round from
`theme.radius` (3, away from the baseline; `radius: 0` for square).
`<Chart maxPoints>` thins big series with LTTB while keeping marks aligned.

### Formatting

```tsx
import { Bar, Chart, currency } from '@pyreon/charts'

<Chart data={rows} x="month" format={currency('$')}>
  <Bar y="revenue" />
</Chart>
```

One `format` covers the y-axis ticks, the tooltip values and the spoken
description. One rather than one per surface, because an axis reading `$3.2K`
beside a tooltip reading `3204.55` for the same point reads as a bug. Ships
`plain` (the default) and `compact` as formatters, and `currency(symbol)`,
`percent()` and `fixed(places)` as factories that return one; any
`(v: number) => string` works.

The formatters are hand-rolled rather than `Intl.NumberFormat`, because this
layer has to compile through PMTC — which lowers your source, not the browser's
built-ins. Pass your own `Intl`-backed formatter on the web when you want full
locale support.

### Time and continuous axes

```tsx
<Chart data={readings} xValue="at">  {/* epoch ms, or any number */}
  <Line y="value" />
  <Axis x time />                     {/* label with calendar steps */}
</Chart>
```

Without `xValue` the points are spaced evenly by index. That is right for a
categorical axis and **wrong for an irregular series**: readings on Jan 1, Jan 2
and Mar 1 drawn at even thirds claim the first gap equals the second, which is
the chart stating something false about the data. `xValue` places each point by
its own value and derives the domain from them.

`xTime` picks the tick labels from calendar units — a day of data ticks hourly,
a year of it monthly — because the nice-number ladder that labels a numeric axis
produces steps like 20,000ms that nobody reads. `xFormat` overrides either.

Bars stay categorical: bars on a continuous axis need a width in domain units,
which is a different chart.

### Server-rendered SVG

The same command list renders to a string, with no DOM and no canvas:

```ts
import { chartToSvg } from '@pyreon/charts/svg'
import { bars } from '@pyreon/charts/engine'

const svg = chartToSvg({
  data: rows,
  marks: [bars((d) => d.revenue)],
  x: (d) => d.month,
  title: 'Monthly revenue',
})
```

Works in an SSG build, a serverless function, or an email pipeline. The output
is deterministic — coordinates are rounded and negative zero normalised — so an
SVG snapshot is an assertion about geometry rather than a pixel flake. Text
width comes from an estimate (`measureApprox`), because a server has no font
metrics; pass `canvasMeasure(ctx, font)` in a browser when label widths must be
exact.

### Accessibility

Both the canvas components and the SVG output present as ONE `role="img"`
graphic rather than a tree of several hundred shapes — naming the individual
rects would make a screen reader read out the whole drawing. Give it a `title`;
the long description is derived from your data via `describeChart` unless you
write your own. `chartTable` returns the same data as rows, for a visually
hidden table beside the chart.

### Families and coordinates

Beyond bars, lines, points, pie, gauge, radar, candlestick and heatmap, `@pyreon/charts` ships twenty chart families as tree-shakeable modules: **funnel, boxplot, treemap, sunburst, tree, sankey, graph** (seeded force / circular), **calendar, parallel, polar, single axis, theme river** and **map** (GeoJSON via `registerMap`, scatter + flight paths on geo). Each is a component (`<TreemapChart>`, `<SankeyChart>`, `<MapChart>`, …), a pure `layout` / `render` / `hit` trio and a server-safe `xToSvg`. Sankey, calendar and parallel coordinates take `orient="vertical"` — the horizontal layout reflected across the diagonal, on every target. Polar takes bar, line and scatter series (`kind: 'scatter'` draws the points alone, at `symbolSize / 2`).

### Interaction, linking, Gantt, sonification

```tsx
import { GanttChart, createChartLink } from '@pyreon/charts'
import { PlotChart, sonifyValues, line, bars } from '@pyreon/charts/engine'

const link = createChartLink() // shared zoom window + crosshair datum
<PlotChart data={price} x={(d) => d.t} marks={[line((d) => d.close)]} dataZoom navigator crosshair keyboard link={link}
  zoomPresets={[{ label: '1m', count: 30 }, { label: '3m', count: 90 }, { label: 'All', count: 0 }]} />
<PlotChart data={price} x={(d) => d.t} marks={[bars((d) => d.volume)]} dataZoom crosshair link={link} />

const sound = sonifyValues(price.map((d) => d.close), { duration: 3000, link }) // pitch over time, crosshair follows
<button onClick={() => void sound.play()}>Play</button>

<GanttChart tasks={tasks} gantt={{ today: '2024-03-16' }} height={240} />

```

`navigator` is the slider dataZoom, `zoomPresets` the range selector, `keyboard` walks the data with a focus ring and a live-region announcement, and a data change of the same shape tweens instead of snapping (`updateAnimation`). Every handler is a pointer handler — a finger drags, pans, brushes and pinch-zooms, a tap shows the tooltip. The family hosts (pie, treemap, sankey, …) carry the same stack: `keyboard` (on by default), `updateAnimation` (a draw-list tween), `legendPosition`, `toolbox={{ saveAsImage: true }}` (a PNG), and the canvas is `aria-describedby` its hidden table.

## Install

```bash
bun add @pyreon/charts @pyreon/core @pyreon/reactivity
```

## Bundle size (measured)

Gzipped (level 9) JavaScript beyond a bare Pyreon app's own runtime, measured
by `examples/benchmark` → `bun run bench:charts-bundle` (one production
`vite build` per entry; ECharts, for comparison, imported the documented
tree-shaken way).

| Chart                          | `@pyreon/charts` | ECharts 6, tree-shaken | ECharts 6, whole package |
| ------------------------------ | --------------------- | ---------------------- | ------------------------ |
| Line                           | 40.9 KB (`PlotChart`) | 155.9 KB               | 361.1 KB                 |
| Bar + line, tooltip, legend    | 40.9 KB (`PlotChart`) | 176.8 KB               | —                        |
| Pie                            | 18.1 KB (`PieChart`)  | 117.3 KB               | —                        |

`PlotChart` does not yet tree-shake per mark: a one-line chart costs the same
as a bar + line + tooltip + legend chart.

## Why Canvas by default

Canvas renders the whole chart as one `<canvas>` element. SVG creates hundreds of DOM nodes for complex charts. Canvas wins for: many data points, frequent signal-driven updates, animations, memory. Reach for `@pyreon/charts/svg` when you need a static image, server rendering or PDF export.

## Performance — the plot engine vs ECharts, spec → SVG

The one surface the two engines share with no DOM is "a spec in, an SVG string out": the plot engine's `renderSvg(renderChart(spec))` against ECharts' server-side renderer (`echarts.init(null, null, { ssr: true, renderer: 'svg' })` → `renderToSVGString()`), same rows, same 960×400 size, axes and grid on both sides, animation off.

| Chart | `@pyreon/charts` | ECharts 6.1 SSR | ratio |
| --- | --- | --- | --- |
| bars, 1,000 rows | 1.40 ms | 6.89 ms | **4.9×** |
| bars, 10,000 rows | 13.4 ms | 59.0 ms | **4.4×** |
| line, 10,000 rows | 6.10 ms | 11.6 ms | **1.9×** |

Measured 2026-09-08, Bun 1.x on an M3 Max, K=15 medians, `NODE_ENV=production`; reproduce with `bun run --filter=@pyreon/charts bench:engine`. Read it as that surface and nothing finer: ECharts draws more chrome by default (a themed legend, styled ticks), the engine emits one command per datum where ECharts batches a line into one path, and neither number is a canvas paint — the canvas executors need a real 2D context on one side and a real DOM on the other, so they are not comparable here. The engine's own layout + render throughput (bars ×10k, line ×100k, treemap, sankey, LTTB) prints above these rows in the same run. *Author-run bench; magnitudes are the signal.*

## Native geometry — the plot engine on iOS/Android

Every family in `@pyreon/charts` — cartesian marks, pie/gauge, radar, candlestick, heatmap, funnel, treemap, sunburst, tree, sankey, graph, polar, theme river, calendar, gantt, parallel coordinates — has its geometry written in the PMTC native subset and BUNDLED into `PyreonChartEngine.swift` and `PyreonChartEngine.kt` by `packages/native/compiler/scripts/gen-chart-engine.ts`. The same TypeScript that lays out a chart on the web is what lays it out on a device: the generator compiles the engine sources through the real Pyreon compiler, and a drift test compiles the generated Swift and Kotlin with `swiftc` / `kotlinc` on every change, so the three targets cannot diverge silently.

What that buys you natively: `layoutX` / `renderX` / `hitXIndex` for every family, returning the same `DrawCmd[]` the web canvas and the server SVG execute — and, for the hosts whose props are plain data, the SAME JSX: `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`, `<GaugeChart>` and — with their accessor bodies inlined into a map over the rows — `<FunnelChart>`, `<PieChart>`, `<RadarChart>`, `<CandlestickChart>` and `<HeatmapChart>` lower to `PyreonChartCanvas` (with `showLegend` / `showTitle` drawn natively through the crossed `renderLegend` / `renderTitle` and the runtime's `pyreonShiftCmds`; the last two through the shared engine frames `renderCandlestickChart` / `renderHeatChart`, which the web hosts paint with too, and a native text measurer `pyreonChartMeasure`) (a SwiftUI / Compose `Canvas` walking that draw list), sized by the container or by `width` / `height`, with the web host's own box arithmetic, `title` as the accessibility label and `data-testid` as the test identifier. A `<PlotChart>` lowers too: each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points` with literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `onSelect` taps the engine's `plotHitBars` (the same hit the web host now uses). A `bubble` mark, a `curve` option, the brush / navigator surfaces (`dataZoom` lowers to pinch + pan over the engine's fraction window), a record (`<CalendarChart values>`) and mixed rows (`<ParallelChart>`) warn by name on native — call the engine functions yourself there. Still web-only: gestures and `onSelect`, `sonifyValues` and the update tween.

A few API shapes exist BECAUSE of the crossing, and they are the shapes to use everywhere: hits are answered as indices by the engine (`hitSankeyIndex` → `{ node, link }`, `hitGraphIndex` → `-1 | i`) with the nullable/union forms (`hitSankey`, `hitGraph`, …) layered on the web side; domains are `{ min, max }` structs, never tuples; dates are ISO strings and days since 1970-01-01 (`daysFromCivil` / `civilFromDays` / `parseIsoDays`), never `Date`; a colour ramp is `rampColor(stops, t)`; a calendar's values are a `{ date, value }` list (`calendarValues(record)` converts); parallel rows are numeric (`parallelRows(axes, rows)` maps categories to indices and gaps to `NaN`); the graph force layout's seed drives a Park–Miller LCG so a seeded layout is byte-identical on every target.

## Documentation

Full docs: [pyreon.dev/docs/charts](https://pyreon.dev/docs/charts) (or `docs/src/content/docs/charts.md` in this repo).

## License

MIT
