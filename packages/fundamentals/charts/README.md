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
| `@pyreon/charts/svg` | `chartToSvg` and every `*ToSvg`: SVG strings with no DOM, for SSR and export. Imported on a server, it also makes every `<Chart>` ship its first frame as SVG in the SSR / SSG HTML |
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
too, since JSX cannot pass a type argument from a parent to its children.
Declare the typed marks once per row type — `const RowBar = Bar<Row>` is a
TypeScript instantiation expression that compiles to `Bar` itself, so it costs
nothing, tree-shakes and lowers to iOS and Android unchanged — and every
`<RowBar y="revenue">` is checked, with `y={(d) => d.revenue}` typed without an
annotation. Marks are children
and draw in order; `<Rule>` / `<Axis>` / `<Tooltip>` / `<Legend>` / `<Zoom>` declare
the rest as data — `<Legend direct />` labels each line at its end instead of a
legend box, `<Zoom window={{ start: 0.5, end: 1 }} lock />` opens zoomed with a
fixed span, `<Cell visualMap />` adds a continuous colour legend. Tick density follows the chart's size, so a phone-width chart is not crowded and a dashboard is not sparse; `<Axis y ticks={4} />` pins it. `by="id"` matches rows across a data change so each one tweens from its own value. `color="region"` pivots long-format rows into one series per
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
`percent()`, `fixed(places)` and `date(pattern)` as factories that return one; any
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

`date(pattern)` formats those labels, in UTC so a tick never moves with the
reader's timezone: `<Axis x time format={date('MMM YYYY')} />`. Tokens are
`YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm` `ss`, and `[text]` is
printed as written. It is plain engine code, so iOS and Android print the same
labels; for the reader's own locale and timezone, pass `locale` instead.

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

`navigator` is the slider dataZoom, `zoomPresets` the range selector, `keyboard` walks the data with a focus ring and a live-region announcement (Up/Down pick one series to follow), and a data change of the same shape tweens instead of snapping (`updateAnimation`). Every handler is a pointer handler — a finger drags, pans, brushes and pinch-zooms, a tap shows the tooltip. The family hosts (pie, treemap, sankey, …) carry the same stack: `keyboard` (on by default), `updateAnimation` (a draw-list tween), `legendPosition`, `toolbox={{ saveAsImage: true }}` (a PNG), and the canvas is `aria-describedby` its hidden table.

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

## Performance — in the browser vs uPlot, Chart.js and Recharts

Mount-to-first-painted-frame and full-data update of one line chart, 800×300,
same seeded random walk for every library, animation off everywhere, no point
symbols, axes + grid on all four. **The default `<PlotChart>` loses to uPlot on
every line cell (1.3–4.8×) and to Chart.js from 100k points up and on both
updates; it beats Chart.js at 1k and 10k points, Recharts on every cell, and
both uPlot and Chart.js on 1k bars.**

| op | `<PlotChart>` (default) | `<PlotChart accessibleTable={false}>` | uPlot 1.6.32 | Chart.js 4.5.1 ¹ | Recharts 3.10.1 |
| --- | --- | --- | --- | --- | --- |
| mount line, 1k | 2.08 [2.02–2.16] | 1.77 [1.65–1.95] | **1.62** [1.49–1.77] | 3.53 [3.38–3.61] | 10.25 [10.04–10.39] |
| mount line, 10k | 3.10 [2.92–3.30] | 3.04 [2.88–3.19] | **2.32** [2.22–2.41] | 4.19 [4.13–4.31] | 78.30 [78.04–78.73] |
| mount line, 100k | 7.02 [6.56–7.24] | 6.73 [6.34–6.91] | **4.85** [4.73–5.05] | 5.22 [5.07–5.37] | 698.6 [696.8–700.7] |
| mount line, 1M ³ | 51.54 [48.21–52.40] | 51.05 [48.42–51.48] | **11.56** [10.51–12.98] | 12.04 [11.96–12.11] 🤝 | 7,226 [7,198–7,234] ² |
| update line, 10k | 6.04 [5.89–6.14] | 1.41 [1.38–1.45] | **1.26** [1.20–1.27] | 1.96 [1.82–2.02] | 23.14 [23.03–23.29] |
| update line, 100k | 9.34 [9.17–9.45] | 5.46 [5.18–5.65] | 4.13 [4.06–4.19] | **2.64** [2.59–2.68] | 193.3 [192.3–193.9] |
| mount bars, 1k | **4.25** [4.07–4.51] | 3.97 [3.89–4.10] | 19.81 [19.74–19.92] | 9.48 [9.39–9.59] | 44.62 [44.25–44.88] |

Milliseconds, median [95% bootstrap CI]; bold = fastest ranked arm, 🤝 = CI
overlaps the fastest. ¹ with its documented large-data config (`parsing: false`,
`normalized`, `min-max` decimation); ² n=15, every other cell n=60; ³ see
"history" below.

Verdicts for the default `<PlotChart>` (every CI below is disjoint — no ties):

| op | vs uPlot | vs Chart.js | vs Recharts |
| --- | --- | --- | --- |
| mount line, 1k | loss 1.29× | win 1.70× | win 4.9× |
| mount line, 10k | loss 1.34× | win 1.35× | win 25× |
| mount line, 100k | loss 1.45× | loss 1.35× | win 100× |
| mount line, 1M | loss 4.46× | loss 4.28× | win 140× |
| update line, 10k | loss 4.79× | loss 3.08× | win 3.8× |
| update line, 100k | loss 2.26× | loss 3.54× | win 21× |
| mount bars, 1k | win 4.66× | win 2.23× | win 10.5× |

**What changed since the first run (2026-09-25, base `fcc34578a` → `ae6c2a242`).**
Two fixes landed for the hot spots that run found: the rows are resolved once
per mount (the accessible description reuses the frame's resolution instead of
walking every row through every accessor a second time), and an accessible
table over 200 rows fills after the first paint instead of before it. Pyreon,
default arm, first run → this run:

| op | before | after | Δ | Pyreon ÷ uPlot, same run |
| --- | --- | --- | --- | --- |
| mount line, 1k | 10.90 | 2.08 | −81% | 7.82× → 1.29× |
| mount line, 10k | 12.04 | 3.10 | −74% | 6.45× → 1.34× |
| mount line, 100k | 17.01 | 7.02 | −59% | 3.71× → 1.45× |
| mount line, 1M | 62.29 | 51.54 | −17% | 5.43× → 4.46× |
| update line, 10k | 5.93 | 6.04 | +2% (unchanged) | 5.76× → 4.81× |
| update line, 100k | 10.69 | 9.34 | −13% | 2.70× → 2.26× |
| mount bars, 1k | 12.71 | 4.25 | −67% | 0.64× → 0.21× |

Read the small cells with the run-to-run drift in mind: this run's machine was
slower on sub-3 ms work — the raw-canvas control moved +39% (1k) / +14% (10k) /
+20% (bars) and uPlot +16–24%, with no code change on either — and flat on
large cells (control −11% to 0% at 100k/1M). That drift works *against* the
Pyreon deltas, so the ratio column (both arms from the same run) is the fair
before/after. Every competitor verdict above comes from this run alone.

**The first-painted-frame window does NOT include the deferred table fill — it
is a trade, not a saving.** The fill is scheduled from the table's `ref` with
`requestAnimationFrame(() => setTimeout(…))`; registered during the mount frame,
that runs after the *next* frame paints, i.e. at least one frame after the
window this table measures has closed (the timed mount samples tear the chart
down before it runs). Traced separately, from mount until the table is filled
and laid out (1,000 rows asserted present): **13.7 ms** of main-thread work for
the default chart at 1k points, against 2.1 ms for its first frame alone and
~2.2 ms for the no-table chart and uPlot over the same span. So the table still
costs ~11.5 ms of main thread; what changed is that the chart is on screen
before it runs, and a screen reader gets the table one frame later. The fill is
a single task of that size, which can delay input handled in the frame after the
first paint. Charts at or under 200 rows fill the table before the first paint,
as before.

**Hot spots that remain** (Chromium trace + CPU profile):

- **Updates still rebuild the table synchronously.** The deferral applies to the
  first mount only; a data change refills the table in the same frame — 6.04 ms
  vs 1.41 ms without a table on the 10k update (≈ 4.6 ms of table work), the one
  Pyreon cell that did not move.
- **Per-point allocation before M4 (not fixed) — and it shows up as GC.** Every
  point is placed as an object before the pixel reduction runs; uPlot reduces
  from the value arrays without allocating. On a fresh page the 1M mount is
  **~31 ms** (untraced, median of 20; traced: 32 ms JS, 0.6 ms GC). In this
  table it is **~51 ms** because the 1M cell runs after hundreds of 1k–100k
  mounts on the same page (³), and after that history the same mount spends
  **21.5 ms of a 50 ms window in GC** (27.9 ms JS). uPlot reads ~13 ms both
  ways. It is not a leak: the heap returns to 5.3 MB (uPlot 5.0 MB) once the
  data is dropped. Remaining 1M JS, self time: `layoutSeriesPoints` 25%,
  `m4Pixels` 22%, mark accessor map 18%, `extendSpan` 13%, `splitRuns` 7%,
  `describeChart` 5%.

**Who draws fewer segments than points.** Pyreon: M4 (first/min/max/last per
half-pixel column), default on. uPlot: in/min/max/out per device pixel once
`n ≥ 4 × width`, default on. Chart.js: `min-max` decimation, **off by default** —
without it (diagnostic arm) it is 3.48 / 7.06 / 20.91 / 165.8 ms for the four
mounts, so Pyreon's default beats *default* Chart.js at every size. Recharts:
none, every point becomes an SVG path segment.

**Method.** Each sample starts inside a `requestAnimationFrame` callback, runs
the op synchronously (React through `flushSync`), lets the frame's style /
layout / paint run, and stops in the first task after it — a `MessageChannel`
message — after a 1×1 `getImageData` on every canvas forces its raster to
finish. The chart host is visible and in the viewport (off-screen content is
not painted). The correctness gate runs in the same task the clock stops in, so
a library that draws late fails the run: series-colour pixels on canvas, path
segments / bar rects in Recharts' SVG, and a changed picture after an update.
**One asymmetry remains and it favours Recharts**: SVG raster happens off the
main thread after paint, so its raster cost is not in the window. Input is each
library's own data shape, built outside the window. A raw-canvas control arm
(no axes, no reduction) runs in every pass.

Apple M3 Max (14 cores), macOS 26, Chromium 151 (Playwright), production
builds, forced GC between samples, `crossOriginIsolated` page. Three passes,
each taken in its own window after six consecutive 20 s load samples below 5 and
accepted only if every stamp stayed ≤ 8 (they read 2.6–6.3), 20 samples per
arm per pass, arm order reshuffled per pass, every arm re-run in every pass.
2026-09-25, at commit `ae6c2a242`. The first run (2.3–3.6 load, base
`fcc34578a`) is kept above only as the "before" column.

Bundle, the minimal import that draws one line chart (JS, gzip -9):

| entry | total | over its framework |
| --- | --- | --- |
| Pyreon `<PlotChart>` + `line()` | 46.7 KB | 35.9 KB over the 10.7 KB Pyreon runtime |
| Pyreon `<Chart><Line/>` | 45.9 KB | 35.2 KB |
| uPlot | 21.5 KB (+ 0.7 KB CSS) | — (no framework) |
| Chart.js, tree-shaken | 46.6 KB | — (no framework) |
| Recharts | 152.9 KB | 86.9 KB over the 66.0 KB React + ReactDOM |

Reproduce from `examples/benchmark`:
`bun bench-scenarios.ts --scenario charts-libs --repeat 3 --wait-quiet 6`
(or per pass: `--repeat 1 --pass-offset K --raw-out passK.json`, then
`--pool pass0.json,pass1.json,pass2.json`), `bun bench-charts-libs-bundle.ts`,
and for the decomposition `bun bench-charts-libs-trace.ts <arm> mount|settled|update <n> [k] [--history]` /
`BENCH_PROFILE=1 bun run build && bun bench-charts-libs-profile.ts <arm> mount <n> [k] [--history]`.
*Written and judged by the Pyreon authors; a synthetic single-chart bench, not
application latency.*

## Native geometry — the plot engine on iOS/Android

Every family in `@pyreon/charts` — cartesian marks, pie/gauge, radar, candlestick, heatmap, funnel, treemap, sunburst, tree, sankey, graph, polar, theme river, calendar, gantt, parallel coordinates — has its geometry written in the PMTC native subset and BUNDLED into `PyreonChartEngine.swift` and `PyreonChartEngine.kt` by `packages/native/compiler/scripts/gen-chart-engine.ts`. The same TypeScript that lays out a chart on the web is what lays it out on a device: the generator compiles the engine sources through the real Pyreon compiler, and a drift test compiles the generated Swift and Kotlin with `swiftc` / `kotlinc` on every change, so the three targets cannot diverge silently.

What that buys you natively: `layoutX` / `renderX` / `hitXIndex` for every family, returning the same `DrawCmd[]` the web canvas and the server SVG execute — and, for the hosts whose props are plain data, the SAME JSX: `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`, `<GaugeChart>` and — with their accessor bodies inlined into a map over the rows — `<FunnelChart>`, `<PieChart>`, `<RadarChart>`, `<CandlestickChart>` and `<HeatmapChart>` lower to `PyreonChartCanvas` (with `showLegend` / `showTitle` drawn natively through the crossed `renderLegend` / `renderTitle` and the runtime's `pyreonShiftCmds`; the last two through the shared engine frames `renderCandlestickChart` / `renderHeatChart`, which the web hosts paint with too, and a native text measurer `pyreonChartMeasure`) (a SwiftUI / Compose `Canvas` walking that draw list), sized by the container or by `width` / `height`, with the web host's own box arithmetic, `title` as the accessibility label and `data-testid` as the test identifier. A `<PlotChart>` lowers too: each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points` with literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `onSelect` taps the engine's `plotHitBars` (the same hit the web host now uses). A `bubble` mark, a `curve` option, the brush / navigator surfaces (`dataZoom` lowers to pinch + pan over the engine's fraction window), a record (`<CalendarChart values>`) and mixed rows (`<ParallelChart>`) warn by name on native — call the engine functions yourself there. Still web-only: gestures and `onSelect`, `sonifyValues` and the update tween.

A few API shapes exist BECAUSE of the crossing, and they are the shapes to use everywhere: hits are answered as indices by the engine (`hitSankeyIndex` → `{ node, link }`, `hitGraphIndex` → `-1 | i`) with the nullable/union forms (`hitSankey`, `hitGraph`, …) layered on the web side; domains are `{ min, max }` structs, never tuples; dates are ISO strings and days since 1970-01-01 (`daysFromCivil` / `civilFromDays` / `parseIsoDays`), never `Date`; a colour ramp is `rampColor(stops, t)`; a calendar's values are a `{ date, value }` list (`calendarValues(record)` converts); parallel rows are numeric (`parallelRows(axes, rows)` maps categories to indices and gaps to `NaN`); the graph force layout's seed drives a Park–Miller LCG so a seeded layout is byte-identical on every target.

## Documentation

Full docs: [pyreon.dev/docs/charts](https://pyreon.dev/docs/charts) (or `docs/src/content/docs/charts.md` in this repo).

## License

MIT
