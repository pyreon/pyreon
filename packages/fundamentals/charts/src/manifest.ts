import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/charts',
  title: 'Charts on web, iOS and Android',
  tagline:
    "Pyreon's own charting engine: marks as JSX children, typed channels, canvas and SVG, the same chart on the web, iOS and Android",
  description:
    "`<Chart>` takes your rows and marks as children — `<Bar y=\"revenue\">`, `<Line>`, `<Area>`, `<Dot>`, `<Arc>` for a pie, `<Stage>` for a funnel. Channels are field names checked against the row — `<Chart<Row>>` checks its own, and a mark given the row type (`<Bar<Row> y=\"revenue\">`) checks its own too; axes, palette, tooltip, an accessible data table and a spoken description come for free. The geometry is pure TypeScript over a flat draw list, which is what makes the same source render on canvas, as an SVG string on a server, and natively on iOS and Android (the draw list is generated into the Swift and Kotlin runtimes). Every mark and chart family is an imported binding, so a bundle carries only what it draws. Entries: `@pyreon/charts` (the stable surface), `/svg` (SSR and export) and `/engine` (every layout, hit test and draw-list builder; not covered by the stability promise).",
  category: 'browser',
  multiplatform: {
    tier: 'shared',
    rationale:
      'the engine is generated into the native runtimes and every chart component lowers to a native PyreonChartCanvas over the same draw list: `<Chart>` with its marks (desugared to `<PlotChart marks>`), the family components (Pie / Gauge / Funnel / Radar / Candlestick / Heatmap / Boxplot / Treemap / Sunburst / Tree / Sankey / Graph / Chord / River / Polar / SingleAxis / Gantt / Calendar / Parallel, and `<MapChart>` from a precomputed `GeoShape[]` — the map registry, raw GeoJSON and `geoShapes()` stay web and warn by name). Theme tokens (`chartThemes`, `palettes`) resolve at compile time and `<ChartThemeProvider mode>` is a compile-time scope.',
  },
  longExample: `import { Arc, Axis, Bar, Chart, Legend, Line, Rule, Tooltip, currency } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

interface Row { month: string; revenue: number; target: number }
const rows = signal<Row[]>([
  { month: 'Jan', revenue: 120, target: 100 },
  { month: 'Feb', revenue: 160, target: 140 },
  { month: 'Mar', revenue: 150, target: 170 },
])

// Marks are children; channels are field names, typed against Row.
<Chart data={rows} x="month" height={320}>
  <Bar y="revenue" label="Revenue" />
  <Line y="target" label="Target" />
  <Rule y={130} label="Break-even" />
  <Axis y format={currency('EUR')} />
  <Tooltip />
  <Legend position="bottom" />
</Chart>

// A family is a mark in the same grammar: this is a donut.
<Chart data={rows} height={240}>
  <Arc value="revenue" label="month" innerRadius={0.6} />
</Chart>

// Writing the signal repaints the canvas in place.
rows.set([...rows(), { month: 'Apr', revenue: 190, target: 180 }])`,
  features: [
    '`<Chart>` with marks as JSX children — `<Bar>`, `<Line>`, `<Area>`, `<Dot>`, `<Band>`, `<Rule>`, `<Label>`, `<Histogram>`, and family marks `<Arc>`, `<Stage>`, `<Cell>`, `<Candle>`',
    'Channels are field names checked against the row (`<Chart<Row>>`, and `<Bar<Row> y>` for a mark); `color="region"` pivots long-format data into one series per value',
    'Chrome as children: `<Axis>`, `<Scale>`, `<Tooltip>`, `<Legend>`, `<Zoom>`, `<Toolbox>` — the interaction children carry their own code, so a chart pays only for the ones it uses',
    'Twenty chart families: pie, gauge, funnel, radar, candlestick, heatmap, boxplot, treemap, sunburst, tree, sankey, graph, chord, river, polar, single-axis, gantt, calendar, parallel, map',
    'Accessible by default: a hidden data table, a spoken description, keyboard focus',
    'Canvas in the browser, SVG strings on a server (`@pyreon/charts/svg`), and native canvases on iOS and Android from the same source',
    'Tree-shaking by construction: each mark and family is an imported binding, locked by CI import budgets',
    'Theme tokens (`chartThemes`, `palettes`, `<ChartThemeProvider>`), formatters (`currency`, `percent`, `compact`), linked charts (`createChartLink`)',
  ],
  api: [
    {
      name: 'Chart',
      kind: 'component',
      signature: '<T>(props: ChartProps<T>) => VNode',
      summary:
        "The chart — `<Chart data x>` with MARK CHILDREN, from `@pyreon/charts`. Channels are FIELD NAMES (`y=\"revenue\"`) or accessors — checked against the row when the chart and the mark are given its type (`<Chart<Row>>`, `<Bar<Row> y>`), since JSX cannot pass a type argument from a parent to its children; marks are JSX children (`<Bar y stack? group? waterfall?>`, `<Line y>`, `<Area y>`, `<Dot y r?>` — `r` makes area-mapped bubbles; every cartesian mark takes `errorLow` / `errorHigh` channels for error bars) and draw in order; `<Rule y | from to>`, `<Axis x|y|y2 format domain time hidden title labels scale>`, `<Scale y=\"log\"|\"time\" x=\"time\" normalize>` (the log view, calendar labels, the 100% stack), `<Histogram x bins>` (bins the rows and draws one bar per bin — the whole plot, like the pivot), `<Tooltip crosshair format>`, `<Legend toggle maxRows position>`, `<Zoom inside navigator presets link brush>`, `<Toolbox saveAsImage restore magicType dataZoom dataView brush>` and `<Label text at series>` (a datum-anchored point marker) declare annotations, axes, scales, the tooltip, the legend, every zoom surface, the tool strip and markers as data beside the marks. `<Zoom>` and `<Toolbox>` carry their implementations, and every cartesian mark carries the plot host, so `<Chart>` bundles only what its children use: a chart without `<Toolbox>` has no tool strip or SVG serializer in it, and a pie through `<Arc>` has no cartesian plot. `facet=\"region\"` renders small multiples — one titled panel per value in a `facetColumns` grid, every panel sharing the y domain; `locale=\"de-DE\"` formats every number surface through Intl. The FAMILY marks cover the row-array hosts with the same grammar — `<Arc value label color? innerRadius?>` (pie / donut), `<Stage value label color? sort? gap?>` (funnel), `<Cell x y value colors? gap?>` (heatmap), `<Candle open high low close upColor? downColor?>` (candlestick, the plot's `x` labels the period) — one family per chart, and `<Chart>` renders that host instead of the cartesian plot (`<Tooltip>` / `<Legend>` / `<Axis y format>` still apply; a cartesian mark or `<Zoom>` beside one is reported and ignored). A `<Show>` around a mark adds/removes its series, and a `<For each>` (or a plain `.map()`) generates one per item — its render callback is resolved here, inside the resolving computed, so an accessor `each` tracks. A child that is not a mark renders nothing and says so in dev. `color=\"region\"` switches to LONG format: one series per distinct value, categories from `x`, gaps where a (category, series) pair is absent, bars grouped unless `stack`. Marks are branded components `<Chart>` scans structurally (never invoked); it resolves them into the `marks={[bars(…)]}` props `<PlotChart>` takes, so the array form is the same spec — `resolveGrammar` is exported for that equivalence. Native: the compiler desugars `<Chart>` to `<PlotChart marks>` (byte-identical emit); the runtime `color` pivot warns by name and renders wide-format.",
      example: `import { Axis, Bar, Chart, Legend, Line, Tooltip, currency } from '@pyreon/charts'

interface Row { month: string; revenue: number; target: number }
const rows: Row[] = [{ month: 'Jan', revenue: 3200, target: 3000 }, { month: 'Feb', revenue: 4100, target: 3400 }]

<Chart<Row> data={rows} x="month" title="Revenue vs target" showTitle>
  <Bar y="revenue" label="Revenue" />
  <Line y="target" label="Target" />
  <Axis y format={currency('$')} />
  <Tooltip />
  <Legend />
</Chart>`,
      mistakes: [
        'Passing `marks={[…]}` to `<Chart>` — the grammar takes marks as CHILDREN; the array form belongs to `<PlotChart>` (same spec, other spelling)',
        'Passing `title` and expecting it drawn — `title` names the chart for screen readers and the accessible table (like the HTML `title` attribute, it is not visible); add `showTitle` to draw it above the chart',
        'Expecting `<Bar y="revenu">` to fail the build — a mark infers its row type from its own props, and JSX cannot pass `<Chart<Row>>`\'s type argument down to it, so a field-name typo on a bare mark is not checked; write `<Bar<Row> y="revenue">` (or an accessor, `y={(d: Row) => d.revenue}`) where you want the check',
        'Writing `y={d.revenue}` — a channel is a field NAME (`y="revenue"`) or an accessor (`y={(d) => d.revenue}`); a value is one number for every row',
        'Expecting `color="region"` to colour bars by a per-row value — it is the long-format SPLIT (one series per distinct region); for a per-mark colour use `color="#hex"` on the mark',
        'Rendering `<Bar>` outside a `<Chart>` — marks are branded descriptors the chart reads; alone they render nothing (and warn on native)',
        'Putting a non-mark child (a `<div>`, your own wrapper component) inside `<Chart>` and expecting it to render — only mark components are read; anything else is ignored with a dev warning naming it',
        'Two family marks in one `<Chart>` (`<Arc>` beside `<Stage>`), or a family mark beside `<Bar>` — one family per chart; the first family wins and the rest is reported, never merged',
        'Conditionally including a mark with `{cond && <Line …/>}` written once at setup — wrap it in `<Show when={() => cond()}>` (or an accessor child) so the series follows the signal',
        'Looking for a `series` array — layering IS the children; a combo chart is a `<Bar>` beside a `<Line>`, a second axis is `<Line axis="right">` + `<Axis y2>`',
      ],
      seeAlso: ['PlotChart', 'ChartThemeProvider'],
    },
    {
      name: 'Sma',
      kind: 'component',
      signature: '<T>(props: AverageProps<T>) => VNode | null  // also Ema; Trend (no window); Bollinger (window, k?)',
      summary:
        "The INDICATOR marks, from `@pyreon/charts`: `<Sma y window>` (simple moving average), `<Ema y window>` (exponential), `<Trend y>` (least-squares line) and `<Bollinger y window k>` (a filled envelope `k` standard deviations wide — 2 by default — plus its middle line). Each is DERIVED from its `y` series rather than read off each datum, so it layers beside the series it smooths like any other mark and takes the same `label` / `color` / `width` options; the leading `window - 1` points are gaps, not zeros. `<Bollinger>` resolves to TWO marks, a band and a line, labelled `\"<label> band\"` / `\"<label> middle\"`. Under a `color` pivot each series gets its own indicator over its own column. They are the array form's `sma` / `ema` / `trend` / `...bollinger` factories spelled as children, and lower to iOS and Android when `window` and `k` are numeric literals.",
      example: `import { Bollinger, Chart, Line, Sma } from '@pyreon/charts'

interface Candle { day: string; close: number }
const candles: Candle[] = [{ day: 'Mon', close: 101 }, { day: 'Tue', close: 104 }, { day: 'Wed', close: 102 }]

<Chart<Candle> data={candles} x="day">
  <Line y="close" label="Close" />
  <Sma y="close" window={20} label="SMA 20" />
  <Bollinger y="close" window={20} k={2} />
</Chart>`,
      mistakes: [
        'Leaving out `window` on `<Sma>` / `<Ema>` / `<Bollinger>` — there is no default window; the mark is skipped with a dev warning',
        'Expecting `<Bollinger>` to be one series — it is a filled band plus its middle line, two legend entries and two accessible-table columns',
        'Passing a computed `window` in a native app — the window must be a numeric literal for the iOS and Android lowering, which bakes it into the emitted call',
      ],
      seeAlso: ['Chart', 'sma'],
    },
    {
      name: 'PlotChart',
      kind: 'component',
      signature: '<T>(props: PlotChartProps<T>) => VNodeChild',
      summary:
        "The array form of `<Chart>`, from `@pyreon/charts/engine`: the same engine, with marks passed as a `marks={[…]}` array of imported factories instead of JSX children. `<Chart>` resolves its children into exactly these props. No ECharts, no third-party engine. Marks are IMPORTED BINDINGS (`bars`, `line`, `area`, `points`, `stackedBars`, `groupedBars`, `stackedArea` (shares over time — areas filled between running totals), `band(low, high)` (a REGION between two channels: a confidence interval or min/max range, whose floor is the data rather than the axis an `area` closes to), `waterfall`, plus the `histogram()` spread over the crossing `binValues`), so tree-shaking is structural rather than a build flag: a bar chart never pulls the radial trigonometry, the decimation or the time scales. Geometry is pure TypeScript over plain data and the platform half is a short backend that walks a flat `DrawCmd[]`, which is why the same source is the path to native rendering. Renders to canvas with a device-pixel-ratio-correct surface; `showLegend`, `tooltip`, `crosshair` and a title are opt-in props, and width falls back to the container's own so a chart in a flexible column fills it. The legend is INTERACTIVE by default: clicking an entry toggles its series, the domain rescales to what is visible, and hidden entries render muted (`legendToggle: false` opts out). `rtl` lays the chart out right-to-left — implemented as a MIRROR of the finished draw list about the canvas centreline, so bands run from the right, the value axis moves to the right gutter and the legend's swatch sits right of its label, while every pointer is mirrored back before it is hit tested (a click still reports the category it landed on). Text is repositioned, never reversed. The mirror is a TWO-WAY seam: screen -> chart turns a pointer into chart space before a hit test, and chart -> screen (`screenX` / `screenRectX`) turns chart geometry back into DOM space before it reaches an overlay's `style.left` — the tooltip goes through the second half, and a custom host that positions a DOM overlay from chart geometry must too. `saveAsImage` serialises the MIRRORED list, so an SVG export is the chart on screen rather than its mirror image. It lowers to native through `pyreonMirrorCmds`, whose parity with the web mirror is asserted by executing all three implementations; every family host (treemap, sankey, …) takes `rtl` natively through the same mirror.",
      example: `import { PlotChart, bars, line } from '@pyreon/charts/engine'
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
/>`,
      mistakes: [
        'Reaching for `<PlotChart>` in app code — `<Chart>` with mark children is the stable API and resolves to the same props; `/engine` is outside the stability promise',
        'Passing `marks` as a string type name — a mark is an imported FUNCTION, which is exactly what makes the unused ones droppable; there is no string-keyed registry to tree-shake around',
        'Expecting two series to be told apart without a legend — colours come from a per-series palette, but `showLegend` is opt-in and a chart with neither legend nor tooltip is unlabelled',
        'Reaching for `tooltip` on a static chart in a report — it installs pointer handlers and a DOM overlay, which is why it is off by default',
        'Passing a curve as a string (`curve: "smooth"`) — a curve is an imported BINDING (`import { smooth }`), like a mark, which is what lets an unused one tree-shake; there is no string registry',
        'Animating in the host with CSS or rAF hacks — the engine takes `progress` (0..1) and returns that frame pure; `<PlotChart>` already tweens it on first paint and respects `prefers-reduced-motion`',
        'Adding `line` or `points` marks to a `horizontal` chart and wondering where they went — the horizontal frame is bar-family only (a horizontal line chart is a transposed coordinate system, a different chart), so non-bar marks are skipped',
        'Spacing an irregular time series by index — without `xValue` the points sit at even thirds whatever their timestamps, so the chart claims gaps that are not there; pass `xValue={(d) => d.at}` and `xTime` for calendar tick labels',
        'Leaving `format` unset on a money or percentage chart — the default prints the raw number, so a revenue axis reads `3200000`; `currency`, `percent`, `compact` and `fixed` ship in the same subpath and one `format` covers the axis, the tooltip and the spoken description at once',
        'Reading a rescaled axis as a data change after a legend toggle — hiding a dominant series RESCALES the domain to the visible ones (that is the point: it is how you read the small series); the accessible table still carries every series',
        'Expecting `crosshair` on a `horizontal` chart — the pointer sweeps rows there and a vertical rule would mislead, so it is a documented no-op; the tooltip still works',
        'Painting a 100k-point series without `maxPoints` — every point becomes a command on every repaint; `maxPoints={1000}` thins the visible slice with LTTB (marks stay aligned, hits report the GLOBAL row index) and the picture is the same to the eye. It draws exactly `maxPoints` DISTINCT rows as of 0.52; before that the last bucket collided with the pinned final row and one slot was wasted on a duplicate.',
        'Reading rounded bars as a style bug — `theme.radius` (3) rounds the corners away from the baseline by default; `theme={{ radius: 0 }}` is square, and a mark\'s own `borderRadius` always wins',
      ],
      seeAlso: ['chartToSvg', 'Arc'],
    },
    {
      name: 'ChartThemeProvider',
      kind: 'component',
      signature: '(props: { theme?: Partial<ChartTheme> | (() => Partial<ChartTheme> | undefined); light?: Partial<ChartTheme>; dark?: Partial<ChartTheme>; children? }) => VNodeChild',
      summary:
        "Provides ONE theme to every chart below it, in layers: the mode's built-in theme (or an outer provider's), then `theme` (both modes), then `light` or `dark` (only in that mode — a brand whose ground or palette differs by mode). The MODE is not a prop: it is the framework-wide colour mode (`useColorMode` from @pyreon/core), set by `<PyreonUI mode>` or `<ColorModeProvider mode>`, else the page's declared `color-scheme`, else `prefers-color-scheme`, live — so a chart below a dark `<PyreonUI>` is dark with no wiring, and the mode is applied where each chart sits (a mode set below a provider still picks its override). `ChartTheme` is a token map — `palette` (series colours in draw order), `background`, `surface` (tooltip / pager cards), `text`, `label` (ticks, legend entries), `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius` (the bar corner marks fall back to), `enterMs` / `updateMs` — and every host, family, legend, title, tooltip and accessible description reads from it. A host's own `theme` prop merges over all of it. `palettes` exports the named sets as data (`pyreon` — the default —, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`, `tableau10`, `okabeIto`, `tailwind`). On native a literal mode and the provider are compile-time scopes (`theme={chartThemes.dark}` and `palette: palettes.okabeIto` resolve at compile time).",
      example: `import { ColorModeProvider } from '@pyreon/core'
import { Bar, Chart, ChartThemeProvider, palettes } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

interface Row { q: string; v: number }
const rows: Row[] = [{ q: 'Q1', v: 3 }, { q: 'Q2', v: 5 }]
const dark = signal(true) // <PyreonUI mode> sets the mode in a UI-system app

<ColorModeProvider mode={() => (dark() ? 'dark' : 'light')}>
  <ChartThemeProvider theme={{ palette: palettes.okabeIto, radius: 4 }} dark={{ background: '#0b1020' }}>
    <Chart data={rows} x="q">
      <Bar y="v" />
    </Chart>
  </ChartThemeProvider>
</ColorModeProvider>`,
      mistakes: [
        'Hard-coding `color` on every mark to "theme" a dashboard — a mark with its own `color` keeps it forever; leave `color` off and set `theme.palette` once (the provider, or the `theme` prop)',
        'Passing a hex list you maintain when a named set exists — `palette: palettes.observable10` is a reference the compiler also resolves on native; a copied list is a second copy to keep in sync',
        'Passing `mode` to `<ChartThemeProvider>` — the mode is the framework-wide colour mode now: set it with `<PyreonUI mode>` or `<ColorModeProvider mode>` from @pyreon/core, so charts, the UI system and every other component agree',
        'Pinning a reactive colour mode in shared multiplatform source and expecting the native build to follow it — only a literal `mode="light"` / `"dark"` is a compile-time scope on native; a reactive one warns and the charts below follow the platform scheme',
        'Branching on the mode inside `theme={() => …}` to vary one token by mode — use `light={{ … }}` / `dark={{ … }}`: they are plain data, so they lower on native, where an accessor cannot',
        'Reading `useChartTheme()` once at setup — it returns an ACCESSOR; call it inside the effect that draws so a mode flip repaints',
        'Building a full `ChartTheme` by hand from four fields — the type has thirteen required tokens now; start from `chartThemes.light` / `.dark` and spread overrides, or pass a `Partial` to `theme`',
      ],
      seeAlso: ['PlotChart', 'Arc'],
    },
    {
      name: 'BoxplotChart',
      kind: 'component',
      signature: '<T>(props: BoxplotChartProps<T>) => VNodeChild',
      summary:
        'A boxplot per category from RAW SAMPLES: `values={(d) => d.samples}` is reduced with `fiveNumber` (min, q1, median, q3, max; whiskers at the extremes) and drawn over the engine\'s box geometry, one colour per box from the theme palette. `fiveNumber` / `renderBoxplot` / `hitBox` / `boxplotToSvg` are exported for hosts that build their own. Lowers to SwiftUI and Compose like every other family host — title, legend, tap tooltip, entrance and `onSelectIndex` included — and is tapped on both device lanes.',
      example: `import { BoxplotChart } from '@pyreon/charts'

interface Group { name: string; samples: number[] }
const groups: Group[] = [{ name: 'eu', samples: [12, 15, 14, 30, 11] }, { name: 'us', samples: [20, 22, 19, 25] }]

<BoxplotChart data={groups} x={(g: Group) => g.name} values={(g: Group) => g.samples} height={220} title="Latency by region" />`,
      mistakes: [
        'Passing pre-computed quartiles as `values` — the prop takes the RAW samples and reduces them; feed summaries to `renderBoxplot(rows: FiveNumber[])` directly instead',
        'Reading an empty box as a bug — a category with fewer than two samples has no spread, so its box collapses to its median line',
      ],
      seeAlso: ['PlotChart'],
    },
    {
      name: 'sma',
      kind: 'function',
      signature: '<T>(y: Accessor<T>, window: number, options?: MarkOptions) => Mark<T>',
      summary:
        'Indicator MARKS over a value accessor, for the finance and telemetry charts that draw a signal beside its smoothing: `sma(y, window)` (simple moving average), `ema(y, window)` (exponential), `trend(y)` (least-squares line) and `bollinger(y, window, k?)` (the ±k·σ envelope as a FILLED `band` plus its middle line, returned as an ARRAY of marks to spread into `marks` — two marks, not three lines: a band\'s bounds can be computed from the series via `transform`/`transform2`, which is the only shape a rolling window fits). Each is a mark like `line`, so it layers in the same `marks={[…]}` array, takes the same `label` / `color` / `width` options, and the leading `window - 1` points are gaps rather than zeros. The value forms `smaValues` / `emaValues` / `stdevValues` / `trendValues` are exported for hosts that need the numbers, and live in a separate crossing module so `sma` / `ema` / `trend` LOWER to iOS and Android (with a numeric-literal window), and `bollinger` does too — its array spread expands to the band and the middle line it names.',
      example: `import { PlotChart, line, sma, bollinger } from '@pyreon/charts/engine'

interface Candle { t: number; close: number }
const candles: Candle[] = [{ t: 1704067200000, close: 101 }, { t: 1704153600000, close: 104 }]

// bollinger returns the band's marks as an ARRAY: spread it into marks.
<PlotChart data={candles} xValue={(d: Candle) => d.t} xTime marks={[...bollinger((d: Candle) => d.close, 20), line((d: Candle) => d.close, { label: 'Close' }), sma((d: Candle) => d.close, 20, { label: 'SMA 20' })]} />`,
      mistakes: [
        'Pre-computing the average into the data and drawing it with `line` — the indicator mark re-derives on every data change and keeps the warm-up gap honest; a baked column silently freezes when the window changes',
        'Reading the first `window - 1` points as missing data — they are gaps by design (no average exists yet); the engine draws the polyline from the first full window',
        'Destructuring `bollinger`\'s result as three lines — it is TWO marks now, a filled `band` and its middle line; index it, or spread it, but do not assume the arity',
        'Passing a computed window or width to an indicator in a NATIVE app — the emit needs numeric literals to lower them and names the limit rather than guessing; a runtime window keeps the mark web-only',
      ],
      seeAlso: ['PlotChart', 'Candle'],
    },
    {
      name: 'chartToSvg',
      kind: 'function',
      signature: '<T>(options: ChartToSvgOptions<T>) => string',
      summary:
        'Render a chart to a standalone `<svg>` STRING. Pure — no DOM, no canvas, no measurement context — so it runs in an SSG build, a serverless function or an email pipeline, where a canvas surface does not exist. Output is deterministic (coordinates rounded to two decimals, negative zero normalised), which makes an SVG snapshot a real assertion about geometry rather than a pixel flake. Labels are XML-escaped. The `<svg>` is `role="img"` named by its `<title>`; given a title and no description, the long form is DERIVED from the data via `describeChart`. Text width comes from `measureApprox` by default — an honest estimate, since a server has no font metrics; pass `canvasMeasure(ctx, font)` in a browser when label widths must be exact. The whole family has the same one-call form — `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg`, `heatmapToSvg`, `funnelToSvg`, `treemapToSvg`, `sunburstToSvg`, `treeToSvg`, `riverToSvg`, `polarToSvg`, `sankeyToSvg`, `graphToSvg`, `calendarToSvg`, `ganttToSvg`, `parallelToSvg`, `boxplotToSvg` — so every chart type the engine draws renders on a server. Each takes the same `theme` its canvas host takes, and reads the same fields from it, so the static export matches the chart the browser paints.',
      example: `import { chartToSvg } from '@pyreon/charts/svg'
import { bars } from '@pyreon/charts/engine'

interface Row { month: string; revenue: number }
const rows: Row[] = [{ month: 'Jan', revenue: 120 }]

const svg = chartToSvg({
  data: rows,
  marks: [bars((d: Row) => d.revenue)],
  x: (d: Row) => d.month,
  title: 'Monthly revenue',
})
// -> '<svg xmlns="..." role="img" aria-labelledby=...>...</svg>'`,
      mistakes: [
        'Expecting exact label widths on a server — `measureApprox` estimates from glyph counts; axis gutters have slack so a few percent moves nothing visible, but do not use it for tight text layout',
        'Passing a title and assuming that is enough for a screen reader — a graphic whose only accessible text is its name says a chart exists and nothing about what it shows; leave `description` unset to get the derived one, or write your own',
        'Rendering several charts into one page without changing `svg.idPrefix` — the `<title>`/`<desc>` ids collide and `aria-labelledby` resolves to the first one',
        'Reaching for it to get a PNG — it emits vector markup; rasterize with the canvas backend (`paint`) or a downstream converter',
        'Omitting `theme` on a themed app and expecting the export to match — a helper given no theme renders the LIGHT default, so a dark page ships a light-mode chart into its own markup; pass the same theme the host has',
      ],
      seeAlso: ['PlotChart'],
    },
    {
      name: 'Arc',
      kind: 'component',
      signature: '<T>(props: ArcProps<T>) => VNode | null',
      summary:
        'The pie and donut mark: `<Chart data><Arc value label /></Chart>`. `innerRadius` (0 to 1) makes it a donut; `color` is an optional per-slice channel, the theme palette otherwise. A family mark renders the pie host instead of the cartesian plot, so `<Tooltip>`, `<Legend>` and `<Axis y format>` apply and cartesian marks beside it are reported and ignored. `<Chart onSelect>` receives the slice index. The accessibility contract is the same as every chart: a `role="img"` graphic with a derived description, `aria-describedby` its hidden data table, keyboard-walkable. `<GaugeChart>` is the sibling for a single value against a range.',
      example: `import { Arc, Chart, GaugeChart, Legend, Tooltip } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

interface Share { name: string; amount: number }
const shares = signal<Share[]>([{ name: 'Direct', amount: 40 }, { name: 'Search', amount: 35 }])
const cpu = signal(42)

<Chart data={shares} height={240}>
  <Arc value="amount" label="name" innerRadius={0.6} />
  <Tooltip />
  <Legend />
</Chart>
<GaugeChart value={() => cpu()} min={0} max={100} title="CPU" />`,
      mistakes: [
        'Using a pie for more than a handful of slices — angular area is hard to compare; the engine will draw it, which is not the same as it reading well',
        'Putting `<Bar>` beside `<Arc>` — one family per chart; the cartesian mark is reported and ignored',
        'Two family marks in one `<Chart>` (`<Arc>` beside `<Stage>`) — the first wins and the rest is reported, never merged',
      ],
      seeAlso: ['Chart', 'Stage'],
    },
    {
      name: 'Candle',
      kind: 'component',
      signature: '<T>(props: CandleProps<T>) => VNode | null',
      summary:
        'The candlestick mark: `<Chart data x><Candle open high low close /></Chart>`, one period per row, the chart\'s `x` labelling it. Direction is encoded by colour (close against open; up green, down red by default, `upColor` / `downColor` override). `<Chart onSelect>` receives the candle index; the whole COLUMN is the hit target, since a wick is one pixel wide. A doji (open equal to close) keeps a 1px body, because flat trading is a fact and a missing candle reads as missing data. The price domain is niced so the axis lands on readable ticks.',
      example: `import { Candle, Chart, Tooltip } from '@pyreon/charts'

interface Day { day: string; o: number; h: number; l: number; c: number }
const days: Day[] = [{ day: 'Mon', o: 10, h: 20, l: 5, c: 15 }, { day: 'Tue', o: 15, h: 18, l: 9, c: 11 }]

<Chart data={days} x="day" height={260}>
  <Candle open="o" high="h" low="l" close="c" />
  <Tooltip />
</Chart>`,
      mistakes: [
        'Feeding periods newest first and reading the chart right to left — periods render in DATA order, oldest first by convention; sort ascending',
        'Expecting volume bars — volume is a second chart sharing the x axis, not a candle option',
        'Aiming a click at the candle body — the hit target is the whole COLUMN, deliberately: a doji body is one pixel tall and selection must not be a game of skill',
      ],
      seeAlso: ['Chart', 'Cell'],
    },
    {
      name: 'Cell',
      kind: 'component',
      signature: '<T>(props: CellProps<T>) => VNode | null',
      summary:
        'The heatmap mark: `<Chart data><Cell x y value /></Chart>` — two categorical axes, a value per cell, colour as the third channel. Category order is FIRST-SEEN (weekday names carry an order alphabetical sorting destroys); duplicate (x, y) observations SUM; absent cells are NOT drawn, because absence and zero are different facts. `colors` is the ramp as `#rrggbb` stops, interpolated by hand-rolled math so the same code lowers to native. `<Chart onSelect>` receives the index of the tapped CELL, not of a row: duplicate observations sum into one cell, so the cell is the unit on screen.',
      example: `import { Cell, Chart, Tooltip } from '@pyreon/charts'

interface Ev { day: string; hour: string; count: number }
const events: Ev[] = [{ day: 'Mon', hour: '09', count: 12 }, { day: 'Tue', hour: '09', count: 4 }]

<Chart data={events} height={220}>
  <Cell x="hour" y="day" value="count" />
  <Tooltip />
</Chart>`,
      mistakes: [
        'Expecting alphabetically sorted axes — category order is first-seen from the data, which is what keeps Mon..Sun in week order; sort the DATA to sort the axes',
        'Reading an undrawn cell as zero — absent cells are skipped, not painted cold; emit explicit zero observations when zero is a fact worth showing',
        'Passing a colour ramp as anything but `#rrggbb` stops — named colours and rgb() strings are not parsed; the hex restriction is what lets the ramp math lower to native',
        'Using the `onSelect` index as a ROW index — it indexes cells, and duplicate (x, y) observations sum into one cell',
      ],
      seeAlso: ['Chart', 'Arc'],
    },
    {
      name: 'RadarChart',
      kind: 'component',
      signature: '<T>(props: RadarChartProps<T>) => VNodeChild',
      summary:
        'Radar (spider) chart from `@pyreon/charts` — one polygon per datum over shared spokes. Each axis normalises by its OWN max, so axes in different units (revenue beside a score out of 5) are comparable on one chart; a shared scale would flatten every small-range axis to the centre. Fewer than three axes draws nothing (no area to enclose). The fill is translucent (`fillAlpha`, default 0.25) with a full-strength outline, so overlapping polygons stay readable. Geometry (`renderRadar`, `radarPolygon`, `radarAngles`) exported standalone.',
      example: `import { RadarChart } from '@pyreon/charts'

interface Player { name: string; speed: number; power: number; skill: number }
const players: Player[] = [{ name: 'Ana', speed: 90, power: 40, skill: 80 }]

<RadarChart
  data={players}
  axes={[{ label: 'Speed', max: 100 }, { label: 'Power', max: 100 }, { label: 'Skill', max: 100 }]}
  values={(d: Player) => [d.speed, d.power, d.skill]}
  label={(d: Player) => d.name}
  showLegend
/>`,
      mistakes: [
        'Comparing absolute magnitudes across axes — each spoke normalises by its own `max`, so polygon SHAPE compares profiles, not sizes; put same-unit series on a PlotChart when magnitude is the story',
        'Passing `values` in a different order than `axes` — the two are index-aligned, and a swapped pair silently plots speed on the power spoke',
        'More than a handful of polygons — overlapping fills become unreadable past 3-4 series; filter the data or facet into several charts',
      ],
      seeAlso: ['PlotChart', 'Arc'],
    },
    {
      name: 'TreemapChart',
      kind: 'component',
      signature: '(props: TreemapChartProps) => VNode',
      summary:
        "The hierarchy families of Pyreon's own engine share ONE data shape: `TreeNode { name, value?, children?, color? }`. `<TreemapChart>` (squarified), `<SunburstChart>` (radial partition) and `<TreeChart>` (tidy node-link, five orientations) all take the same `data`, so a drill-down can switch views without reshaping. Each is a reactive canvas host over a pure `layoutX` / `renderX` / `hitX` trio and ships an `xToSvg` for the server; cells and arcs carry a child-index `path` as a stable selection identity. Siblings in the same wave: `<FunnelChart>`, `<BoxplotChart>` (`fiveNumber` from raw samples), `<SankeyChart>`, `<GraphChart>` (a SEEDED force layout — same input, same picture) and `<ChordChart>`, which takes sankey's `{ nodes, links }` verbatim but closes the layout into a circle — so it drops the axis and with it the acyclicity a sankey needs to read well, which is why a flow that goes BOTH ways (imports and exports, migration between regions, a confusion matrix) belongs on a chord.",
      example: `import { TreemapChart, SunburstChart } from '@pyreon/charts'
import type { TreeNode } from '@pyreon/charts'

const repo: TreeNode[] = [
  { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] },
  { name: 'docs', value: 30 },
]

<TreemapChart data={repo} height={260} onSelect={(cell) => cell && console.log(cell.path)} />
<SunburstChart data={repo} innerRatio={0.25} height={320} />`,
      mistakes: [
        'Giving a parent BOTH a value and children — the parent value wins and the children are laid out inside it as if it were their sum; leave `value` off a parent so it is derived',
        'Expecting `onSelect` to fire for the parent when a leaf is clicked — the hit test returns the DEEPEST cell; read `cell.path` to walk up',
        'Reading colours as data — descendants inherit and TINT the top-level colour so nesting reads as nesting; set `color` per node only when it carries meaning',
        'Passing a graph to `<TreeChart>` — a tree needs one parent per node; use `<GraphChart nodes links>` for arbitrary networks (its force layout is deterministic, seeded)',
      ],
      seeAlso: ['PlotChart'],
    },
    {
      name: 'MapChart',
      kind: 'component',
      signature: '(props: MapChartProps) => VNode',
      summary:
        "GeoJSON regions filled by value. `map` takes three shapes: a name registered once with `registerMap(name, geojson)` (ECharts' shape), a FeatureCollection directly, or already-projected `GeoShape[]` (what `geoShapes(json)` returns) — the third is the one that LOWERS TO NATIVE (a `Polygon | MultiPolygon` union puts one field at two array depths, which the native struct lowering refuses to merge; the two web-only shapes warn by name at compile time, and `geoShapes` itself reads GeoJSON so shared source passes a PRECOMPUTED const). `layoutGeoShapes` fits the rings into the box with aspect preserved and north up; `renderGeo` colours through the SAME ramp the heatmap uses so a `visualMap` strip cannot disagree with the map; `hitGeoIndex` is ring-accurate. `renderGeoPoints` / `renderGeoPaths` draw scatter, effectScatter halos and flight paths on top through `layout.project`. The other coordinate families follow the same pattern: `<CalendarChart>` (contribution grid, strict ISO dates), `<ParallelChart>`, `<PolarChart>` (radial or concentric bars, polar lines), `<RiverChart>` (silhouette streamgraph) and `layoutSingleAxis`.",
      example: `import { MapChart, geoShapes, registerMap } from '@pyreon/charts'
import type { GeoJson, GeoShape } from '@pyreon/charts'

declare const euGeoJson: GeoJson
registerMap('eu', euGeoJson)
// Web: the registry name, or the FeatureCollection, reads fine.
<MapChart map="eu" values={{ DE: 83, FR: 68, PL: 38 }} options={{ showLabels: true }} height={360} onSelect={(r) => r && console.log(r.name)} />

// Shared source (web + iOS + Android): only a PRECOMPUTED GeoShape[] crosses.
// geoShapes() reads GeoJSON, so project on the web or in a build step, not here.
const euShapes: GeoShape[] = geoShapes(euGeoJson)
<MapChart map={euShapes} values={{ DE: 83, FR: 68, PL: 38 }} height={360} onSelectIndex={(i) => console.log(i)} />`,
      mistakes: [
        'Keying `values` by a property the features do not carry — the region name comes from `properties.name` by default; pass `options.nameProperty` for ISO codes or ids',
        'Expecting hole rings (lakes) to be cut out — only outer rings are drawn; a hole renders as part of its region',
        'Passing coordinates in Mercator metres — `projectLonLat` takes DEGREES (lon, lat) and projects itself; pre-projected data double-projects',
        'Using a hand-picked colour per region instead of `values` — the fill is a value → colour mapping through the ramp so the accessible table and any visualMap strip stay truthful',
        'Reaching for `registerMap` in SHARED multiplatform source — the registry is a module map no native target has, and neither raw GeoJSON nor `geoShapes()` crosses; pass a PRECOMPUTED `GeoShape[]` const (projected on the web or in a build step) and the warnings go away',
      ],
      seeAlso: ['TreemapChart', 'Cell'],
    },
    {
      name: 'GanttChart',
      kind: 'component',
      signature: '(props: GanttChartProps) => VNode',
      summary:
        "The Gantt family — one row per task on a calendar-aligned time axis. `layoutGantt` sizes the label column by the widest name (capped by `labelFraction`), picks the tick UNIT from the span (day / week / month / quarter / year, ticks aligned to UTC calendar boundaries), lays a lane header wherever `group` changes, places bars on the padded (or explicit `domain`) time range, milestones as diamonds at their instant, dependency ELBOWS from a predecessor's end to a successor's start, and a `today` marker. `renderGantt` draws lane bands, grid, ticks, bars with darker `progress` insets, elbows and the dashed today line, with an entrance `progress` that grows the bars; `hitGantt` prefers the bar, then the row band right of the labels; `ganttToSvg` is the server path. ISO `YYYY-MM-DD` strings or epoch ms both work as dates.",
      example: `import { GanttChart } from '@pyreon/charts'
import type { GanttTask } from '@pyreon/charts'

const tasks: GanttTask[] = [
  { id: 'design', name: 'Design', start: '2024-03-01', end: '2024-03-10', progress: 0.5, group: 'Phase 1' },
  { id: 'build', name: 'Build', start: '2024-03-08', end: '2024-03-24', dependencies: ['design'], group: 'Phase 1' },
  { id: 'launch', name: 'Launch', start: '2024-03-25', milestone: true, dependencies: ['build'], group: 'Phase 2' },
]
<GanttChart tasks={tasks} gantt={{ today: '2024-03-16' }} height={240} onSelect={(row) => row && console.log(row.task.id)} />`,
      mistakes: [
        'Giving a milestone an `end` — a milestone is an instant; `end` is ignored and the diamond sits at `start`',
        'Expecting a dependency on an unknown id to throw — it is skipped silently by design (a partial import must still draw); validate ids upstream',
        'Passing local-time `Date` objects — dates are UTC epoch ms or ISO date strings; a `Date` must be converted with `getTime()`',
        'Reading `rect.h` as the row height — `rect` is the BAR (60% of the row); `band` is the full row',
        'Mixing `group`s out of order — a lane header is emitted at every CHANGE of `group`, so interleaved groups produce repeated headers',
      ],
      seeAlso: ['PlotChart', 'CalendarChart'],
    },
    {
      name: 'createChartHandle',
      kind: 'function',
      signature: '() => ChartHandle',
      summary:
        "The imperative handle (ECharts `dispatchAction`) for ONE `<PlotChart handle>`: a link (`zoom`, `hover`) plus `selected` (pinned datums, GLOBAL indices) and `hidden` (series by mark index), and `dispatch(action)` over the ECharts vocabulary — `highlight` / `downplay` (VISIBLE-row index, the crosshair's space), `select` / `unselect` / `toggleSelect` (global datum), `legendSelect` / `legendUnselect` / `legendToggle` (series), `dataZoom` (fractions; a full window reads back as null), `restore` (clears all four), `showTip` / `hideTip` (the crosshair datum), `legendAllSelect` and `legendInverseSelect` (over the bound chart's `seriesCount`, which the chart keeps on the handle), `takeGlobalCursor` (arm the area brush with a type) and `brush` (set or clear its areas). One pure reducer (`applyChartAction`) runs every dispatch, and it crosses: on iOS and Android `createChartHandle()` lowers to a `PyreonChartHandle`, the bound chart reads and writes its fields, and `handle.dispatch({ ... })` with an inline action object lowers too. Every dispatch is one batch, so the chart repaints once. The signals ARE the chart's state: `handle.selected()` reads the chart, and the change callbacks (`onSelectChange` / `onHighlight` / `onLegendChange` / `onZoom`) fire for a dispatch exactly as for a pointer; `onClick` / `onDoubleClick` / `onContextMenu` report the datum under the pointer (-1 for a miss) whatever `selectedMode` says, and `onRendered` follows each paint. A handle is also a link — pass it as `link` to sibling charts to connect them.",
      example: `import { createChartHandle } from '@pyreon/charts'
import { PlotChart, bars } from '@pyreon/charts/engine'

interface Row { k: string; v: number }
declare const rows: Row[]
const chart = createChartHandle()
<PlotChart data={rows} x={(d) => d.k} marks={[bars((d: Row) => d.v)]} handle={chart} selectedMode="multiple" onSelectChange={(s) => console.log(s)} />
chart.dispatch({ type: 'select', index: 2 })
chart.dispatch({ type: 'dataZoom', start: 0.25, end: 0.75 })
chart.dispatch({ type: 'restore' })`,
      mistakes: [
        'Passing one handle as `handle` to TWO charts — both then share selection and legend state; give each chart its own handle and connect them with `link`',
        'Dispatching `highlight` with a GLOBAL index on a zoomed chart — highlight speaks the VISIBLE-row space like the crosshair; subtract the window offset (the pins in `select` are global)',
        'Expecting a miss-click to clear the selection — like ECharts it does not; dispatch `unselect` or `restore`',
        'Reading `handle.selected()` outside a reactive scope and expecting it to update — it is a signal; read it in an effect, a computed or JSX',
      ],
      seeAlso: ['createChartLink', 'PlotChart'],
    },
    {
      name: 'createChartLink',
      kind: 'function',
      signature: '() => ChartLink',
      summary:
        "Linked charts (ECharts `connect`): a shared `{ zoom, hover }` pair of signals that every `<PlotChart link>` in a group uses IN PLACE of its private dataZoom window and crosshair datum. No bus, no registry, no unsubscribe — a chart that unmounts simply stops reading them, so there is nothing module-level to leak. Every gesture that writes the window (wheel, pan, brush, navigator drag, zoom presets, double-click reset) and the crosshair datum (hover, leave) therefore propagates to every linked chart; each chart keeps its own series, legend and tooltip. `sonifyValues` accepts the same link to move the crosshair with the sound.",
      example: `import { createChartLink } from '@pyreon/charts'
import { PlotChart, line, bars } from '@pyreon/charts/engine'

interface Bar { t: string; close: number; volume: number }
declare const price: Bar[]
const link = createChartLink()
<PlotChart data={price} x={(d) => d.t} marks={[line((d: Bar) => d.close)]} dataZoom crosshair navigator link={link} />
<PlotChart data={price} x={(d) => d.t} marks={[bars((d: Bar) => d.volume)]} dataZoom crosshair link={link} />`,
      mistakes: [
        'Creating the link inside the component body of a chart that re-mounts — every mount then gets a fresh link and nothing stays linked; create it where the group lives',
        'Linking charts with DIFFERENT category counts — the shared window is a fraction and the hover a datum index, so they only line up when the charts share an x range',
        'Linking a pie or a treemap — the link carries a cartesian window + datum; the families have no shared datum index',
        'Expecting `link.zoom()` to be non-null at rest — null means the whole range (the untouched state), by the same convention as the host',
      ],
      seeAlso: ['PlotChart', 'sonifyValues'],
    },
    {
      name: 'sonifyValues',
      kind: 'function',
      signature: '(values: number[], options?: SonifyOptions) => Sonification',
      summary:
        "A series as sound: each value maps linearly to a pitch between `minHz` and `maxHz` (`valueToHz` — a FINITE value outside the domain clamps to the range's ends, a non-finite one is a gap), one oscillator steps through them over `duration`, a gap plays as silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair along with the audio so the eye and the ear read the same datum. `play()` resolves when the last datum has sounded or on `stop()`; every timer is cleared and the oscillator stopped and disconnected on BOTH endings (a replay never trips a stale-oscillator error). The `AudioContext` is OWNED: one is constructed lazily on the first `play()` and closed when the run settles or is stopped, because a browser caps live contexts per document (Chrome at ~6) and a per-play context that is never closed throws `NotSupportedError` on the seventh press. A caller-supplied `options.context` is used as-is and NEVER closed — it belongs to the caller. Browsers require a user gesture before audio starts, so call `play()` from a click.",
      example: `import { createChartLink } from '@pyreon/charts'
import { sonifyValues } from '@pyreon/charts/engine'

declare const closes: number[]
const link = createChartLink()
const sound = sonifyValues(closes, { duration: 3000, minHz: 220, maxHz: 880, link })
<button onClick={() => void sound.play()}>Play</button>
<button onClick={() => sound.stop()}>Stop</button>`,
      mistakes: [
        'Calling `play()` on page load — browsers keep an `AudioContext` suspended until a user gesture; wire it to a click',
        'Expecting a value that replaces a gap to fade in — a gap is silence and a value snaps in; there is nothing to tween from',
        'Sonifying an unnormalised mix of series — the domain defaults to the finite min/max of THESE values; pass `domain` to compare two runs on one scale',
        'Dropping the returned object — `stop()` is the only way to end early, and `playing()` is how a play button knows to toggle',
        'Closing an `options.context` you passed in and expecting the hook to have done it — a supplied context is the caller\'s to close; only the one the hook constructs is closed on settle',
      ],
      seeAlso: ['createChartLink', 'PlotChart'],
    },
  ],
  gotchas: [
    {
      label: 'Which entry',
      note: '`@pyreon/charts` is the stable surface: `<Chart>`, its marks, the family components, formatters, theme and linking. `/svg` renders charts to SVG strings with no DOM. `/engine` exports every layout, hit test and draw-list builder for building on the engine, and is not covered by the stability promise.',
    },
    {
      label: 'A non-finite value is a GAP, everywhere',
      note: 'In `@pyreon/charts`, NaN AND Infinity are gaps: they are dropped from every domain (`extent`, the auto axis, the parallel/calendar/boxplot/histogram domains), draw as nothing (a zero-height bar at the zero line, a break in a line, an absent parallel segment), are absent from the tooltip and the accessible table, and are silence in `sonifyValues`. `makeTicks` returns ZERO ticks for a non-finite BOUND rather than a thousand NaN labels. `isFiniteNumber` is the engine\'s predicate and is exported — it is written in the native subset (`v === v && v - v === 0`) because `Number.isFinite` has no lowering inside the crossing engine, and it is what a custom mark or family should use so its gaps match the built-ins\'.',
    },
  ],
})
