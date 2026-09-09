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
Reach for `/plot` when you want a small, fast, dependency-free chart whose
geometry renders to a pure SVG string on the server (`chartToSvg` /
`optionToSvg` — the components themselves paint a canvas after hydration),
hydrates nothing it doesn't need, and shares its geometry with the native
(SwiftUI/Compose) runtimes.

<PackageBadge name="@pyreon/charts" href="/docs/charts-plot" />

## Quick start

```tsx
// @check
import { Axis, Bar, Legend, Line, Plot, Tip, currency } from '@pyreon/charts/plot'

type Row = { month: string; revenue: number; target: number }
const rows: Row[] = [
  { month: 'Jan', revenue: 3200, target: 3000 },
  { month: 'Feb', revenue: 4100, target: 3400 },
  { month: 'Mar', revenue: 3800, target: 3800 },
]

export const Revenue = () => (
  <Plot<Row> data={rows} x="month" title="Monthly revenue vs target" showTitle>
    <Bar y="revenue" label="Revenue" />
    <Line y="target" label="Target" />
    <Axis y format={currency('$')} />
    <Tip />
    <Legend />
  </Plot>
)
```

That is the whole grammar: **channels are field names** (`y="revenue"` is
typed against `Row`; an accessor `y={(d) => d.revenue}` works too), **marks are
children** (they draw in order, so an `<Area>` under a `<Line>` under `<Dot>`
is three lines of JSX), and the tooltip, legend, axes, zoom and reference
lines are **declared as data** beside the marks they apply to. A `<Show>`
around a mark adds and removes its series like any other Pyreon child.

| Child | Declares |
| --- | --- |
| `<Bar y stack? group? />` `<Line y />` `<Area y />` `<Dot y r? />` | The marks. `stack` / `group` combine bars; `r` turns dots into area-mapped bubbles. |
| `<Rule y label? />` `<Rule from to />` `<Rule x />` | A reference line (horizontal, or vertical at a continuous x) or band. |
| `<Label text at? series? />` | A datum-anchored label: at the series' `max` / `min`, or at an index. |
| `<Axis y format domain />` `<Axis x time hidden />` `<Axis y2 … />` | Axis formatting and domains. |
| `<Tip crosshair? format? />` | The pointer tooltip. |
| `<Legend toggle? maxRows? />` | The legend (click toggles series). |
| `<Zoom inside? navigator? presets? link? brush? />` | Pinch/wheel zoom and drag pan, the slider strip, preset buttons, cross-chart linking, the range brush. |

`<Plot color="region">` switches to **long format**: every `y` mark becomes
one series per distinct `region`, categories come from `x`, a missing
(category, series) pair is a gap, and bars group side by side unless `stack`.

The **family marks** make the same grammar cover the row-array families — one
family per plot, and `<Plot>` renders that family's host instead of the
cartesian plot:

| Family mark | Renders | Channels |
| --- | --- | --- |
| `<Arc value label color? innerRadius? />` | A pie (`innerRadius={0}`) or donut. | one slice per row |
| `<Stage value label color? sort? gap? />` | A funnel, descending by default. | one stage per row |
| `<Cell x y value colors? gap? />` | A heatmap; duplicate `(x, y)` cells sum. | one observation per row |
| `<Candle open high low close upColor? downColor? />` | A candlestick; the plot's `x` labels each period. | one period per row |

```tsx
// @check
import { Arc, Legend, Plot, Tip } from '@pyreon/charts/plot'

type Share = { browser: string; pct: number }
const share: Share[] = [
  { browser: 'Chrome', pct: 65 },
  { browser: 'Safari', pct: 19 },
  { browser: 'Firefox', pct: 8 },
]

export const BrowserShare = () => (
  <Plot<Share> data={share} title="Browser share" showTitle>
    <Arc value="pct" label="browser" innerRadius={0.6} />
    <Tip />
    <Legend />
  </Plot>
)
```

`<Tip>`, `<Legend>` and `<Axis y format>` apply to a family host too; a
cartesian mark or `<Zoom>` beside a family mark is reported and ignored.

<Example file="./examples/charts/plot-grammar" title="The grammar — marks as children, a Show around one" />

The grammar and the array form below are ONE spec: `<Plot>` resolves its
children into the `marks={[bars(…)]}` props `<PlotChart>` takes (`resolveGrammar`
is exported and tested to produce identical series), and on native the
compiler desugars `<Plot>` to that element before lowering — the two emit
byte-identical Swift and Kotlin.

## The array form

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

<Example file="./examples/charts/plot-marks" title="Marks, reactivity and formatting" />

That demo is the real engine, mounted live: marks compose in paint order (area
under line under points), `data` is an accessor so **Regenerate** repaints
without re-mounting anything, and one `format` feeds the axis, the tooltip and
the accessible description together.

## Marks

A mark pairs a value accessor `(d, index) => number` with paint options. They
draw in array order.

| Mark | Draws |
| --- | --- |
| `bars(y, options?)` | Vertical bars from the zero line. |
| `line(y, options?)` | A polyline through the values; `dash: [4, 2]` draws it dashed (a target or a forecast). |
| `area(y, options?)` | A filled area under the line. |
| `points(y, options?)` | Discrete points. |
| `stackedBars(y, options?)` | One stack segment per mark — combine several; `stackNormalize` on the chart draws them as shares (the 100% stack). |
| `groupedBars(y, options?)` | Side-by-side bars per category. |
| `bubble(y, r, options?)` | Points with a per-datum radius channel. |
| `waterfall(y, options?)` | Floating steps from running total to running total (the bridge chart); `negativeColor` fills the falls, dashed connectors carry the level across. |
| `stackedArea(y, options?)` | Shares over time: one filled area per mark, each between the running total below it and its own top, so the topmost outline is the total. |
| `band(low, high, options?)` | A filled REGION between two channels — a confidence interval or a min/max range. Two accessors, not one: a region has two bounds and no single value, so its floor is the data rather than the axis an `area` closes to. `showValues` labels the HIGH edge; the tooltip and the accessible table carry both. |
| `bollinger(y, window, k?)` | The ±k·σ envelope as a filled `band` plus its middle line — an ARRAY of two marks to spread. Its bounds are computed from the series (a rolling window), which is what `band` supports through `transform`/`transform2`. |
| `histogram(rows, x, options?)` | Not a mark but a spread: bins the `x` channel (`bins`, nice-step edges) and returns `{ data, x, marks }` for `<PlotChart {...histogram(rows, (d) => d.age, { bins: 12 })} />`. |

<Example file="./examples/charts/plot-marks-intervals" title="The marks that are not one value per category" />

That second demo covers the shapes the table above describes and the first demo
does not draw: an interval, a rolling envelope, shares over time, a running
total, and a raw sample binned.

`bars`, `line`, `area` and `points` also take `errorLow` / `errorHigh`
accessors: a capped whisker from the low bound to the high one through each
datum, both bounds joining the domain so a whisker never leaves the axis.

Options (`MarkOptions`): `label` (legend/tooltip/a11y name), `color`, `width`
(stroke), `radius` (points), `showValues` (a value label per datum — on
every kind, not only bars: a line, area or point labels the placed point, a
bar labels its rect, and a `band` labels its HIGH edge), and
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
- **Pinned domains** — `yDomain` / `y2Domain` (or `<Axis y domain>` /
  `<Axis y2 domain>`); derived from the data when absent.
- **Gaps** — a `null`, `undefined`, `NaN` or infinite accessor result is a
  gap, not a zero: the bar is skipped, the line breaks, no dot is drawn, the
  value stays out of the domain, the tooltip row and the table cell are empty.
  A measurement nobody took must not read as `0`; `d.v ?? 0` says otherwise
  where that is the truth.

- **Log y scale** — `yScale="log"` (or `<Scale y="log">` / `<Axis y scale="log">`)
  draws every left-axis mark in the log view: decades on the axis (with the
  2× and 5× minors under two decades), non-positive values as gaps, bars
  growing from the axis floor. Tooltip, table and value labels keep the real
  values — the view is geometry, not a data edit. A right axis stays linear.
- **Time y axis** — `yTime` (or `<Scale y="time">`), the twin of `xTime`.
- **Axis titles** — `xTitle` / `yTitle` / `y2Title` (or `<Axis x title>`), each
  in a line of its own outside the tick labels, the y titles running along
  their axes.
- **Labels that do not fit** — `xLabels`: `auto` (default) slants overflowing
  category labels 45° and thins numeric ones to every k-th; `rotate` and
  `thin` force one; `all` draws every label upright and lets them collide.
  The horizontal frame thins its category rows the same way.
- **Locale** — `locale="de-DE"` formats numbers (and, under a time axis, the
  dates) through `Intl` on every surface: `1.234,5`, `12. Mär.`. An explicit
  `format` / `xFormat` wins; `registerLocale` refines what Intl produces.

One `format` formatter applies to the y axis, the tooltip and the accessible
description — an axis that says `$3.2K` beside a tooltip that says `3204.55`
reads as a bug. `plain`, `fixed`, `percent`, `currency` and `compact` ship in
the same subpath; any `(v: number) => string` works.

## Scales, shares and small multiples

```tsx
// @check
import { Axis, Bar, Histogram, Plot, Scale } from '@pyreon/charts/plot'

const sales = [
  { month: 'Jan', region: 'eu', units: 120, lo: 100, hi: 140 },
  { month: 'Jan', region: 'us', units: 80, lo: 70, hi: 95 },
  { month: 'Feb', region: 'eu', units: 150, lo: 130, hi: 170 },
  { month: 'Feb', region: 'us', units: 90, lo: 75, hi: 100 },
]

export const Shares = () => (
  <Plot data={sales} x="month" color="region">
    <Scale normalize />
    <Axis y title="Share of units" />
    <Bar y="units" stack />
  </Plot>
)

export const Facets = () => (
  <Plot data={sales} x="month" facet="region" facetColumns={2}>
    <Bar y="units" errorLow="lo" errorHigh="hi" />
    <Axis x title="Month" labels="rotate" />
  </Plot>
)

export const Ages = () => (
  <Plot data={sales}>
    <Histogram x="units" bins={5} label="Months" />
  </Plot>
)
```

- `<Scale y="log" | "time" x="time" normalize>` states the scales together;
  `<Axis>` carries the same switches per axis, plus `title` and (on x)
  `labels`.
- `<Bar waterfall negativeColor>` is the waterfall; `<Bar y errorLow errorHigh>`
  (and `<Line>`, `<Area>`, `<Dot>`) draw error bars from two channels.
- `<Histogram x bins label color format>` bins the `x` channel and draws one
  bar per bin; it replaces the rows the way the long-format pivot does, so it
  is the whole plot.
- `facet="region"` renders small multiples: one titled panel per distinct
  value in a `facetColumns`-wide grid, every panel sharing the y domain (a
  facet on its own scale cannot be compared to its neighbour). The marks,
  channels and switches apply to every panel; a new value adds a panel, and a
  value that persists keeps its panel across data changes.

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

`innerRadius={0}` is a pie; anything up to 1 is a donut. In the grammar the
same chart is `<Plot data={share}><Arc value="pct" label="browser" innerRadius={0.6} /></Plot>`.

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
`prefers-reduced-motion`. A data **update** of the same shape tweens from the
previous frame to the new one (`updateAnimation`, on by default, over
`theme.updateMs` or `updateDuration`); a shape change — a row added, a series
removed — snaps, because there is no path between two different shapes that
means anything. `<PlotChart>` tweens its VALUES; every family host tweens its
DRAW LIST (two frames of the same shape interpolate command by command), so a
treemap cell glides to its new rect and a slice sweeps to its new angle
without the host knowing what a value is.

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

Natively the same sentence is the canvas's accessibility label: `a11y.ts`
crosses with the engine, so VoiceOver and TalkBack read `describeChart` over
the series the canvas painted. The precedence matches the web — an explicit
`accessibilityLabel`, else the data description, else `title`, else the family
word — so a chart is never an unnamed rectangle on any target. The offscreen
TABLE is web-only (a native canvas has no DOM to put it in).

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

## Hierarchy and relations

Every hierarchy family reads one `TreeNode` shape — `{ name, value?, children?, color? }` — so the same data drives a treemap, a sunburst and a node-link tree:

```tsx
import { TreemapChart, SunburstChart, TreeChart } from '@pyreon/charts/plot'
import type { TreeNode } from '@pyreon/charts/plot'

const repo: TreeNode[] = [
  { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] },
  { name: 'docs', value: 30 },
]

<TreemapChart data={repo} height={260} onSelect={(cell) => cell && console.log(cell.path)} />
<SunburstChart data={repo} innerRatio={0.25} height={320} />
<TreeChart data={repo} tree={{ orient: 'LR' }} height={260} />
```

Relations use node/link lists: `<SankeyChart nodes links>` lays flows out by longest path with relaxed bands and stacked ribbons, and `<GraphChart nodes links graph={{ layout: 'force' }}>` runs a **seeded, deterministic** force layout (or `circular` / `none` for given coordinates). Every family ships `layoutX` / `renderX` / `hitX` as pure functions and an `xToSvg` for the server, plus `<FunnelChart>` and `<BoxplotChart>` (five-number summaries from raw samples via `fiveNumber`).

## Coordinates

Beyond the cartesian grid the engine ships the ECharts coordinate systems as families of their own: `<CalendarChart start end values>` (the contribution-graph grid, strict ISO dates), `<ParallelChart axes rows>` (parallel coordinates with category or value axes and highlighted rows), `<PolarChart axes series>` (radial or concentric bars and polar lines), `<RiverChart series>` (a silhouette streamgraph), a single axis (`layoutSingleAxis`), and `<MapChart map values>` over GeoJSON registered with `registerMap` — regions filled by value through the same colour ramp the heatmap uses, with `renderGeoPoints` / `renderGeoPaths` for scatter and flight paths on top.

## ECharts option compatibility

`optionToSvg(option)` and `compileOption(option)` accept an **ECharts-shaped option** and render it on this engine — cartesian series, every family above, `coordinateSystem: 'polar' | 'geo' | 'singleAxis'`, `dataset` (with `filter` / `sort` transforms), `graphic`, `visualMap`, `custom` series with `renderItem`, `lines`, `effectScatter`, `pictorialBar`, `markPoint` / `markLine`, titles, legends and tooltips. Anything the facade cannot map is **named** in `compiled.warnings` (`option-key-unsupported`, `series-option-unsupported`, …) rather than dropped silently, and a gallery-shaped conformance corpus ratchets the clean pass-rate upward in CI.

```ts
import { optionToSvg, compileOption } from '@pyreon/charts/plot'

const svg = optionToSvg({ xAxis: { data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'bar', data: [120, 200] }] }, { theme: 'dark', locale: 'de' })
const { spec, warnings } = compileOption(myEchartsOption)
```

## Themes

One token map draws every chart. `ChartTheme` is `palette` (series colours in
draw order), `background`, `surface` (tooltip and pager cards), `text`, `label`
(ticks and legend entries), `axis`, `grid`, the three semantic tokens
`positive` / `negative` / `muted`, the value `ramp`, `fontFamily`, `fontSize`,
`titleSize`, `radius` (the bar corner marks fall back to) and the two animation
lengths `enterMs` / `updateMs`. Every host, family, legend, title, tooltip and
accessible description reads from it, so a chart with no props already looks
right on both grounds:

- **With no provider**, a chart follows the system colour scheme —
  `chartThemes.light` or `chartThemes.dark` by `prefers-color-scheme`, live.
- **`<ChartThemeProvider>`** pins a mode or tracks your app's:
  `mode={useMode}` hands PyreonUI's reactive mode straight through, and
  `theme={{ … }}` merges token overrides for every chart below it.
- **The `theme` prop** on any host merges over whatever is in scope.

The last four tokens exist because a colour that is not a series colour still
has to change with the ground. `positive` and `negative` are semantic — an up
or down candle, today's rule on a gantt, a highlighted parallel line — and are
never palette entries. `muted` fills a cell or region with **no data**; its job
is to recede into `background`, so it cannot be one value for both modes.
`ramp` is the low-to-high value ramp behind `<HeatmapChart>`, `<CalendarChart>`
and `<MapChart>`, and it must gain contrast against its own `background` as the
value rises — a ramp that runs light-to-dark reads correctly on a white page
and backwards on a dark one, where the highest value becomes the faintest mark.
A per-family option (`emptyColor`, `upColor`, `stops`, …) still wins over the
token.

```tsx
// @check
import { useMode } from '@pyreon/ui-core'
import { ChartThemeProvider, PlotChart, bars, palettes } from '@pyreon/charts/plot'

interface Row { q: string; v: number }
const rows: Row[] = [{ q: 'Q1', v: 3 }, { q: 'Q2', v: 5 }]

export const Themed = () => (
  <ChartThemeProvider mode={useMode} theme={{ palette: palettes.okabeIto, radius: 4 }}>
    <PlotChart<Row> data={rows} x={(d) => d.q} marks={[bars((d) => d.v)]} />
  </ChartThemeProvider>
)
```

`palettes` exports the named sets as data — `pyreon` (the default),
`pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`,
`tableau10`, `okabeIto` (colour-vision safe) and `tailwind` — so a palette is a
reference, not a hex list you maintain. A mark with its own `color` keeps it;
the rest cycle through `theme.palette`.

<Example file="./examples/charts/plot-theme" title="Themes — mode, palette and a live flip" />

On native the theme is a struct: `theme={chartThemes.dark}` and
`theme={{ palette: palettes.okabeIto }}` resolve at compile time, a literal
merges over the defaults, and `<ChartThemeProvider mode theme>` is a
compile-time scope its chart children inherit — mode, then the provider's
literal overrides, then the chart's own `theme`, the web's three layers in
the web's order. A reactive `mode` (an app's own signal) or an absent one
(the web follows the system scheme) cannot be read at compile time; the
light theme applies and the compiler says so by name.

## Every host, one surface

All the family hosts — `<PieChart>` / `<GaugeChart>`, `<FunnelChart>`,
`<RadarChart>`, `<CandlestickChart>`, `<HeatmapChart>`, `<BoxplotChart>`,
`<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<SankeyChart>`,
`<GraphChart>`, `<RiverChart>`, `<PolarChart>`, `<GanttChart>`,
`<CalendarChart>`, `<ParallelChart>`, `<MapChart>` — share one canvas host, so
they share one prop vocabulary:

| Prop | Does |
| --- | --- |
| `title` / `subtitle` / `showTitle` | Names the chart for assistive tech and the hidden table; `showTitle` draws the block above the chart. |
| `showLegend` / `legendPosition` | A legend for families with named entries (series, slices, stages, top-level nodes) — `top` by default, or `bottom`, `left`, `right`. |
| `tooltip` | A tooltip with the family's own lines (a slice's share, a candle's OHLC, a cell's value, a node's name), following the pointer or the last touch. Off by default — a static report has no pointer. |
| `animate` / `updateAnimation` / `updateDuration` | The entrance tween on first paint (`theme.enterMs`) and the update tween on a same-shape data change (`theme.updateMs`); both off under `prefers-reduced-motion`. |
| `keyboard` | On by default: the canvas is focusable, Arrow / Home / End walk the items the accessible table lists, each is announced in a live region and ringed where the family can place a ring, Enter / Space select through the family's callbacks, Escape clears. |
| `toolbox` / `onSaveImage` | `{ saveAsImage: true }` draws a download button; the family hosts save the canvas as a PNG (the vector form is the family's `*ToSvg`), `<PlotChart>` saves an SVG or, with `'png'`, the canvas. |
| `onSelect` | The family's rich hit (a cell, an arc, a node, a Sankey node-or-link) or `null`; the row-array hosts (Pie, Funnel, Candlestick, Boxplot, PlotChart) report the row index. |
| `onSelectIndex` | The engine's INDEX hit, on **every** host — what the native tap gesture reports, so a handler written once works on all three targets. |
| `theme` / `width` / `height` / `class` / `accessibleTable` | As on `<PlotChart>`. The canvas is `aria-describedby` its table; the table stops at 1,000 rows and says so in its caption. |

The same vocabulary crosses: on iOS and Android every host — `<PlotChart>`
and `<Plot>` included — draws the title block, the legend and the tooltip
natively (the tooltip on a **tap**, cleared by a tap on nothing; the plot's
lines come from the crossing `tooltipAt` / `tooltipLines` over the sliced
series, a named `tooltipFormatter` lowers, and `crosshair` — a hover concept —
stays web-only and says so). What the legend lists and what a tap says come
from one crossing module — `treemapLegend`, `sankeyTip`, `pieTip`, … and
`renderTooltip` in `chrome.ts` — that the web host calls too, so the three
targets cannot disagree about either. `<BoxplotChart>` crosses (its
`fiveNumber` reduction runs in the generated engine) and `<RadarChart>`'s tap
reports the engine's `{ series, axis }` hit on every target; `<OptionChart>`
and `<MapChart>` decline by name. A host with no `theme` and no provider
follows the phone's colour scheme at runtime, as it follows
`prefers-color-scheme` in a browser. `animate` crosses too: every host whose
engine takes a `progress` (all of the above except Pie, Radar, Candlestick and
Gauge, which draw fully formed everywhere) plays the same cubic ease-out
entrance over `theme.enterMs` inside `PyreonChartEntrance`, off under Reduce
Motion (iOS) and a zero animator scale (Android) — the web host's
`prefers-reduced-motion` — and `animate={false}` emits the host exactly as
before. On an engine with no entrance the prop is named as inert rather than
as a native gap. The `theme` prop follows too: a named theme or a literal
colours the title, legend and tooltip box, seeds the options palette (an
explicit `palette` in the options wins) and paints `theme.background`
behind the chart on every host, as the web canvas host does. A theme that
is not a literal (`theme={someVariable}`) cannot be read at compile time;
it is reported by name and the default applies.

Bars are rounded by default: `theme.radius` (3) rounds the corners away from
the baseline — top for a positive bar, bottom for a negative one, the far end
when `horizontal` — so a bar still reads as growing from zero. A mark's own
`borderRadius` wins; `theme={{ radius: 0 }}` restores square bars; stacked and
grouped segments keep only their mark radii.

### Big data on `<PlotChart>`

`maxPoints` caps what one paint draws: past it the visible slice is thinned with
LTTB on the first mark — rows stay aligned across marks, so a line and its area
never disagree — and a 100k-point series paints as a 1k-point one. Hits,
tooltips and selection report the GLOBAL index of the row actually drawn. The
engine's throughput is measured, not asserted: `bun run
--filter=@pyreon/charts bench:engine` (layout + render, 1k–100k points, treemap,
sankey, LTTB; single machine, author-run — treat magnitudes as the signal).

## Registered themes and locales

`registerTheme(name, tokens)` takes the same tokens (the ECharts-shaped
aliases `color` / `backgroundColor` / `textStyle` / `axisLineColor` /
`splitLineColor` still register as-is), with `light` and `dark` built in;
`registerLocale(tag, pack)` over `Intl` feeds `compileOption(option, { theme,
locale })`. `resolveTheme` and `numberFormatter` / `dateFormatter` are exported
for hosts that build specs by hand.

## Interaction

`<PlotChart>` owns the pointer and keyboard model (each prop installs only its own handlers, so a static chart in a report pays for none of it):

- `tooltip`, `crosshair` — hover.
- `dataZoom` — wheel-zoom + drag-pan (ECharts' inside dataZoom); `brush` — shift-drag a band and read it from `onBrush`.
- `navigator` — the slider dataZoom: a strip under the plot with the first series over ALL rows and the window as a draggable band with resize handles.
- `zoomPresets={[{ label: '1m', count: 30 }, { label: '3m', count: 90 }, { label: 'All', count: 0 }]}` — the Highcharts range selector; a strip of buttons under the plot.
- `keyboard` — focus the canvas and walk the data with Arrow / Home / End; the focused datum gets a dashed ring and is announced through a live region, Enter / Space fire `onSelect`, Escape clears.
- `updateAnimation` (default on) — a data change of the same shape tweens to the new frame instead of snapping; `updateDuration` sets the length; `prefers-reduced-motion` disables it.
- **Touch** — every handler is a pointer handler: a finger drags, pans and brushes as a mouse does, two fingers pinch-zoom the window around their midpoint, and a tap shows the tooltip. A zoomable chart sets `touch-action: none`; a static one leaves the page free to scroll over it.
- `legendPosition` — `top` (default), `bottom`, `left` or `right`; a side legend narrows the plot.
- `yDomain` — pin the left y domain (`<Axis y domain>` in the grammar).
- `link={createChartLink()}` — pass the same link to several charts and their zoom window and crosshair datum stay in sync (ECharts `connect`).

```tsx
const link = createChartLink()
<PlotChart data={price} x={(d) => d.t} marks={[line((d) => d.close)]} dataZoom navigator crosshair keyboard link={link} zoomPresets={[{ label: '1m', count: 30 }, { label: 'All', count: 0 }]} />
<PlotChart data={price} x={(d) => d.t} marks={[bars((d) => d.volume)]} dataZoom crosshair link={link} />
```

### Rounded bars

`borderRadius` on a bar-family mark (ECharts' `itemStyle.borderRadius`): a number rounds all four corners, `[topLeft, topRight, bottomRight, bottomLeft]` rounds them individually — `[6, 6, 0, 0]` is the column look that keeps the bar flat on the axis.

```tsx
<PlotChart data={rows} x={(d) => d.k} marks={[bars((d) => d.v, { borderRadius: [6, 6, 0, 0] })]} />
```

The radius travels in the draw list as `corners` on the rect command, clamped by the engine to half the bar's shorter side — so a bar animating up from zero rounds proportionally, and the web canvas, the SSR SVG and the SwiftUI/Compose canvases all draw the same four arcs.

### Gradient fills

`gradient` on a bar-family or `area` mark (ECharts' `LinearGradient` item and area style). You give the stops; the engine resolves the two points against the plot box, so one ramp spans the chart instead of repeating inside every bar.

```tsx
<PlotChart
  data={rows}
  x={(d) => d.k}
  marks={[area((d) => d.v, { gradient: { stops: [{ offset: 0, color: '#2563eb' }, { offset: 1, color: 'rgba(37,99,235,0)' }] } })]}
/>
```

`direction: 'horizontal'` ramps left → right instead of top → bottom. Every gradient-bearing command still carries its solid `color`, so a backend that cannot paint one — or an SVG serialized command-by-command without a `<defs>` — falls back to the colour rather than to nothing.

### Events and actions

ECharts' `on(...)` / `dispatchAction` in Pyreon shapes: every event is a prop, every action is a call on a handle whose signals ARE the chart's state.

- `selectedMode="single" | "multiple"` — a click (or Enter on the keyboard focus) pins the datum; pinned datums keep a heavy outline and report through `onSelectChange` with GLOBAL indices. `onSelect` still fires for the pick.
- `onHighlight` — the hovered datum's GLOBAL index, -1 on leave (ECharts `mouseover` / `mouseout`), whoever moved it: pointer, keyboard, link or dispatch. With it (or `selectedMode` / `handle`) the hovered column draws a faint band and its bars/points an outline — `emphasis={false}` keeps the crosshair alone.
- `onLegendChange` — the hidden series (mark indices) after a legend click (`legendselectchanged`); `onZoom` — the window after any zoom gesture (`datazoom`).
- `handle={createChartHandle()}` — `dispatch({ type })` with `highlight` / `downplay` / `select` / `unselect` / `toggleSelect` / `legendSelect` / `legendUnselect` / `legendToggle` / `dataZoom` / `restore`; read `handle.selected()`, `handle.hidden()`, `handle.zoom()`, `handle.hover()` reactively. A handle is a link too: pass it as `link` to siblings to connect them.

```tsx
const chart = createChartHandle()
<PlotChart data={rows} x={(d) => d.k} marks={[bars((d) => d.v)]} handle={chart} selectedMode="multiple" onSelectChange={(s) => console.log(s)} />
<button onClick={() => chart.dispatch({ type: 'select', index: 2 })}>Pin March</button>
<button onClick={() => chart.dispatch({ type: 'dataZoom', start: 0.25, end: 0.75 })}>Middle half</button>
<button onClick={() => chart.dispatch({ type: 'restore' })}>Reset</button>
```

On native the events/actions props warn by name and the chart renders without them (`onSelectIndex` taps cross today; the handle is the next tier).

## Gantt

`<GanttChart tasks>` lays one row per task on a calendar-aligned time axis — the tick unit (day / week / month / quarter / year) is picked from the span — with lane headers per `group`, darker `progress` insets, milestone diamonds, dependency elbows and a dashed `today` marker. `layoutGantt` / `renderGantt` / `hitGantt` / `ganttToSvg` are the pure halves.

```tsx
<GanttChart
  tasks={[
    { id: 'design', name: 'Design', start: '2024-03-01', end: '2024-03-10', progress: 0.5, group: 'Phase 1' },
    { id: 'build', name: 'Build', start: '2024-03-08', end: '2024-03-24', dependencies: ['design'], group: 'Phase 1' },
    { id: 'launch', name: 'Launch', start: '2024-03-25', milestone: true, dependencies: ['build'], group: 'Phase 2' },
  ]}
  gantt={{ today: '2024-03-16' }}
  height={240}
/>
```

## Sonification

`sonifyValues(values, { duration, minHz, maxHz, link })` plays a series as pitch over time: one oscillator steps through the values, gaps are silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair with the sound. Start it from a click — browsers keep audio suspended until a user gesture.

```tsx
const sound = sonifyValues(closes, { duration: 3000, link })
<button onClick={() => void sound.play()}>Play</button>
```

## The option host

`<OptionChart option>` is the component for an ECharts option: cartesian plans (single or multi-`grid`) paint on a canvas through the same `compiledCommands` the server's `optionToSvg` uses, family and geo plans render as inline SVG, a `timeline` auto-plays or follows `timelineIndex`, and `onSelect` hit-tests clicks against the painted geometry.

```tsx
<OptionChart option={() => option()} width={640} height={320} theme="dark" onSelect={(hit) => hit && select(hit)} />
```

## Native

The engine's geometry is **generated into Swift and Kotlin twins**
(`PyreonChartEngine.swift` / `.kt` in the native runtimes) from the same
TypeScript sources, drift-locked byte-for-byte in CI and compile-proven with
the real toolchains. The flat draw-list design is what makes this possible:
a native canvas executes the same commands the web canvas does. JSX-level
lowering (writing `<PieChart>` in shared source and getting SwiftUI/Compose)
is landing chart-by-chart — see the
[multiplatform capability matrix](/docs/multiplatform) for current status.

## How the engine is verified

- **Engine geometry** is pure and runs in the node suite (scales, layout, marks, stacks, arcs, formatting, a11y, decimation — ~98% there).
- **Every canvas host** runs in real Chromium: its own family suite (geometry, click, reactive repaint) plus one shared sweep that drives all twenty hosts through the same paths — the accessible surface, tooltip hit / miss / leave, click and keyboard selection through both callbacks, PNG export. Browser coverage over the host files is a gate with measured floors; the node run excludes exactly those files, and the two lists are kept in sync so a host is never measured nowhere.
- **Draw-list goldens** — one SVG per family for a fixed dataset, committed and compared byte-for-byte. The SVG is the draw list the canvases paint, and it is deterministic across platforms where a pixel baseline is not.
- **The shipped compiler**: the app-showcase e2e hovers, clicks and keyboards the plot-engine chart on a real page under `@pyreon/vite-plugin` — the hosts' own suites run under vitest's JSX transform, and template-path bugs live in the difference.
- **Native**: the generated Swift/Kotlin engines are drift-locked and compiled by the real toolchains per PR; device assertions ride the tasks showcase.
The scale switches cross with the engine: `yScale`, `yTime`, `stackNormalize`,
the axis titles and `xLabels` lower as literals on both targets (`<Scale>` and
`<Axis title labels scale time>` desugar to them), the waterfall mark lowers,
and the slanted labels paint through the native canvases' own rotation.
Error bars cross too: `errorLow` / `errorHigh` map over the same rows the
values do (the bubble radius channel's shape) into the engine's `errLow` /
`errHigh`. What stays on the web is named at compile time rather than dropped:
`<Histogram>` (the row reshape; `binValues` itself crosses), `locale` (Intl)
and `facet` (a DOM panel grid).

## Choosing between `/plot` and the ECharts bridge

| | `@pyreon/charts/plot` | `@pyreon/charts` (ECharts) |
| --- | --- | --- |
| Dependencies | none | `echarts` peer |
| Bundle | pay per imported mark | lazy-loaded per chart type |
| SSR | `chartToSvg` / every `*ToSvg` is a pure string; the components render a canvas + the data table on the server and paint on the client | client-only render |
| Native | shared generated geometry | web-only |
| Series breadth | growing first-party set | the full ECharts catalog |
