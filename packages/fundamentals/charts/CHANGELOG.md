# @pyreon/charts

## 0.52.0

### Minor Changes

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Accessibility on `<Chart>` / `<PlotChart>`:

  - **Up/Down now step through the series.** Left/Right still walk the data. With a series picked, the live region reads just that series — `Revenue: 3,200 at Mar, 3 of 12` — so a keyboard user can follow one line across the chart instead of hearing every series at every point. Stepping past the last series returns to the whole row; Escape clears both. Up/Down used to duplicate Left/Right.
  - **The spoken summary says how much a series moved,** not only which way: `rising 45% from 100 to 145`, `rising 3.2× from 100 to 320`. No percentage is stated from a zero or negative start. The native `describeChart` says the same.
  - **Fix:** the web canvas's description, table and announcements named series "Series 1", "Series 2" even when each mark had a `label`, so a screen reader heard names no sighted reader saw. They now use the mark's label, as the legend, the tooltip and the native hosts already did.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's value and category axes draw split areas (`ChartSpec.ySplitArea`: bands between the ticks, the colours cycled from the axis start, one per category on a category axis), and a value axis draws minor ticks and minor split lines, each interval cut into a set number of pieces. Series labels take a rotation (about the anchor, with the offset turned with it, as zrender does), an offset, `align` and `verticalAlign`. All of it crosses to iOS and Android through the generated engine.

  The native chart spec printer wrote every array field as numbers, which turned a colour list into `[NaN, NaN]`. It now keeps strings.

- [#3386](https://github.com/pyreon/pyreon/pull/3386) [`e83a9bf`](https://github.com/pyreon/pyreon/commit/e83a9bfd2ce0d1697ee25618ba01d9840a1e6415) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two marks the cartesian surface was missing, and two that were unreachable.

  **`band(low, high)`** — a filled REGION between two value channels: a
  confidence interval, a min/max range, a forecast cone. Distinct from `area`,
  which closes to the axis floor; a band's two edges are both data. Distinct
  from the `errorLow`/`errorHigh` whiskers too — those decorate a value per
  datum, this is the mark. A datum joins the band only when BOTH bounds are
  finite, because half a bound is not a region.

  **`stackedArea(y)`** — `stackedBars`' continuous sibling. Each series fills
  between the running total below it and its own top, so the outline of the
  topmost series is the total. Only non-negative values stack, on the same
  reasoning as the bars.

  Both carry their own second-channel plumbing: `Series.values2` is the band's
  lower bound, kept apart from `errLow`/`errHigh` deliberately so that "draw a
  whisker" and "draw a region" are not the same request. Both lower to native,
  and both real toolchains compile the emit.

  **`waterfall` and `histogram` were documented as importable and were not
  exported.** They existed, they lowered to native, the manifest named them as
  importable bindings — and `import { waterfall } from '@pyreon/charts/plot'`
  was `undefined`. Nothing caught it because the only code importing them was
  the native compiler's own tests, and PMTC parses its input rather than
  resolving it, so those imports never had to exist. Both are exported now, and
  a TOTAL test over the marks module locks the surface: a mark added later has
  to be reachable rather than silently joining them.

  **`showValues` now works on every mark kind.** It was documented as "draw each
  value above its bar" and honoured by bars and waterfall only; on line, area,
  points, stacked, grouped and stackedArea it was a silent no-op — which reads
  as "the option does not apply here" and was really "nobody wrote the branch".
  Each kind labels where its geometry allows: outside the free edge for bars,
  grouped and waterfall, above the point for line, area and points, and INSIDE
  the segment for stacked and stackedArea, which have no free edge to hang a
  label from. A stack prints the segment's OWN value, not the running total the
  outline already shows. The lock is total over the mark kinds, so a kind added
  later has to answer the question.

  **`markers` now draw on the horizontal frame and on stacked / grouped
  series.** They were skipped on all three — a silent no-op on shapes where
  `annotations` drew perfectly well. The skip was not arbitrary: a stacked datum
  is drawn at its RUNNING TOTAL in a band-centred segment, so pushing it through
  the point-like placement would have put the marker where the data never
  appears, and refusing beat lying. The invariant worth keeping is therefore "a
  marker never lands somewhere the datum is not", not "these shapes have no
  markers" — so the anchor is now read back from the same layout the paint used:
  the top centre of a vertical segment, the right end of a horizontal one.

  **The grammar got `<Layer>` and `<Band>` too — and that gap was self-inflicted.**
  `stackedArea` was added to the native compiler's tag map first, which quietly
  claimed a `<Layer>` the web grammar had never heard of: the same source would
  have compiled natively and rendered nothing in a browser. Both tags now exist
  as components, `<Band low high>` has its own desugar branch (a region has two
  bounds and no single `y`, so the generic path rejected it), and the two copies
  of the tag set — the grammar's and the compiler's — are asserted against each
  other from both ends, since the compiler cannot import the package that really
  owns them.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Line and area points on a category axis now sit at their band centres, under their category labels and over any bar in the same band, as ECharts draws them (its default `boundaryGap: true`). Before, the points ran edge to edge while the labels sat at band centres, so every category line chart drew its first point half a band left of its label. `ChartSpec.boundaryGap: false` gives the edge-to-edge layout, with the labels moved onto the points. A chart with bars keeps its bands. Line and area annotations placed by category name land on the same band positions. The native engine is regenerated with the same geometry.

- [#3211](https://github.com/pyreon/pyreon/pull/3211) [`5dca722`](https://github.com/pyreon/pyreon/commit/5dca72251796ddf410fbf68b27deb13d2e02f3f3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Boxplot family: `fiveNumber` (R-7 interpolated quartiles, Tukey 1.5-IQR fences, outliers), `boxplotExtent`, `renderBoxplot` (whiskers with caps, Q1–Q3 box, median line, outlier dots, entrance growing from the median), `hitBox`, `<BoxplotChart>` (reactive canvas host over raw observations, `onSelect`, accessible summary table), `boxplotToSvg` (server-safe, accepts precomputed summaries).

- [#3220](https://github.com/pyreon/pyreon/pull/3220) [`e2e40da`](https://github.com/pyreon/pyreon/commit/e2e40daf78fe0d6abb913849c87f2ba397aad873) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Calendar family: `layoutCalendar` (a day-per-cell grid over an ISO date range — weekday rows with `firstDay` rotation, week columns, month labels at each month's first column, alternating weekday labels, fit-to-box or fixed `cellSize`; strict ISO parsing that rejects impossible dates), `renderCalendar` (values through the shared heat ramp with a data or fixed `domain`, `emptyColor` for days without data, week-by-week entrance), `hitCalendar`, `<CalendarChart>` (reactive canvas host, `onSelect(cell)`, accessible table), `calendarToSvg` (server-safe).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<CandlestickChart>` gains a `zoom` prop (`CandlestickZoom`, every field optional). The `slider` draws ECharts' strip under the chart; drag the band or a handle to move the window. `inside` zooms on the wheel and pans on a drag inside the plot. `window` sets the opening window, and `lock`, `minSpan` and `maxSpan` hold. A click still reports the GLOBAL candle index.

- [#3446](https://github.com/pyreon/pyreon/pull/3446) [`7b1351b`](https://github.com/pyreon/pyreon/commit/7b1351b7b774b6caeb7bf2d4f406f6306e146981) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Adds `<ChordChart>` — flows between categories as ribbons across a circle.

  It takes sankey's `{ nodes, links }` verbatim, so moving a spec between the two
  is a one-word edit. The difference is what the layout encodes: a sankey lays
  flows on an axis, so it reads a direction and wants an acyclic graph; a chord
  closes the circle and drops both, which makes a flow that goes BOTH ways
  (imports and exports, migration between regions, a confusion matrix) its
  ordinary case rather than its awkward one.

  Lowers to SwiftUI and Jetpack Compose like its neighbours, compile-proven on
  both real toolchains.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts: a horizontal bar chart (a category y axis over a value x axis) now lays out as ECharts does — it previously drew nothing, on web and native — including split areas and minor lines on the value axis. A scrolling legend clips the entry the window cuts instead of dropping it, pages vertically, and honours `pageButtonPosition: 'start'`; the draw list gains `clip` / `unclip` commands, executed by the canvas, SVG, SwiftUI and Compose painters. Rich and multi-line labels now rotate as one block, with ECharts' line height.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-datum colour: the engine's `Series` gains an `itemColors` channel, generated into the native engines, and every datum fill (bars, stacked and grouped segments, waterfall steps, points) goes through it, so hover, select and blur act on the datum's own colour.

  The shared canvas host gains a `cursor` hook: the pointer over an item shows its cursor, `pointer` by default, as in ECharts.

- [#3198](https://github.com/pyreon/pyreon/pull/3198) [`524c7b1`](https://github.com/pyreon/pyreon/commit/524c7b14de914e3fa8b4e38228b342cc2ae8e589) Thanks [@vitbokisch](https://github.com/vitbokisch)! - dataZoom + brush on `PlotChart` (ECharts' inside dataZoom + brush select). `dataZoom` adds wheel-zoom that keeps the datum under the cursor fixed, drag-pan by plot-widths, and double-click reset; `brush` adds drag-selection reporting a GLOBAL inclusive datum range through `onBrush` (Shift+drag when both gestures are on), with a persistent highlight band cleared by the next click (`onBrush(null)`). The window is a fraction pair over the data (`zoom.ts` — pure, host-agnostic math: `zoomWindow`/`panWindow`/`sliceRange`/`brushRange`), and the host slices rows through it, so geometry, hit-testing, tooltips and the accessible table stay correct with zero engine awareness. Accessors and callbacks always see GLOBAL indices — a zoom never renumbers your data. The wheel is captured (preventDefault) over a zoomable plot; drags suppress the click so panning never fires `onSelect`.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `date(pattern)` formats epoch milliseconds for a time axis, a tooltip or a table: `<Axis x time format={date('MMM YYYY')} />`. It formats in UTC, so labels never shift with the reader's timezone, and prints the same on the web, iOS and Android. Tokens: `YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm` `ss`; `[text]` is printed as written. `formatDate(ms, pattern)` is the one-shot form.

  Numbers now print the same on iOS and Android as on the web:

  - A template literal or a `<Text>` child holding a whole-valued `Double` printed `7.0` on both native targets where the web prints `7`. The generated chart engine goes through the same path: on iOS, axis ticks read `20.0` and percentage labels `42.0%`; on both targets, calendar year labels read `2024.0`. Such values now go through a JavaScript-faithful `pyreonNumberString`.
  - A numeric `x` field used as categories (`<Chart x="year">`) did not compile on iOS. Such values are now converted to strings.
  - An integer literal outside the 32-bit range, such as an epoch-millisecond timestamp in fixture data, typed its field `Int` and failed to compile on Android. It is now a `Double`, like every other JavaScript number that cannot fit.

- [#3436](https://github.com/pyreon/pyreon/pull/3436) [`fbb41d9`](https://github.com/pyreon/pyreon/commit/fbb41d9c02351d6986cc579034a3290d2b37cc2e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Decimation crosses to iOS and Android, and LTTB stops duplicating its last point

  **The bug, found by writing the differential.** LTTB's buckets were indexed one
  place to the right of the canonical formulation, with two consequences. The
  first interior bucket was never considered at all, so a spike near the start of
  a series could not be selected however prominent it was. And the last bucket
  spanned the empty range `[n-1, n-1)` — no candidates, so `best` kept its initial
  value of `n - 1` and the pinned final row was emitted TWICE. Measured across
  3,781 (size, threshold) pairs, **3,608 ended in a duplicate**, so `maxPoints={N}`
  drew `N - 1` distinct rows. The same shift made the third triangle vertex the
  centroid of the bucket being selected FROM rather than the next one, which is
  not the LTTB criterion — the comment beside it said "next bucket" while the
  indices said otherwise. All three are fixed, so the selection changes.

  **The arithmetic now crosses.** `decimate-values.ts` joins the generated chart
  engine, the same split `indicator-values.ts` made out of `indicators.ts` — the
  `Pt[]` wrapper cannot lower, and one non-crossing signature takes the whole file
  web-only. Bucket edges are advanced by integer accumulation rather than
  `Math.floor(i * every)`, because a Double cannot bound a native loop or
  subscript an array, and there is no integer division to fall back on (the
  emitters wrap both operands of `/` in `Double`). As a side effect the edges are
  now exact: the float form could floor one row early where `span / count` is
  unrepresentable, in 0.066% of edge computations.

  **The native navigator thins its strip.** It passed every row to
  `renderNavigator` on every frame; it now buckets to one min/max pair per 2px
  column, exactly as the web host has since the host-parity pass. A 36px overview
  never needed 100k points, least of all on a phone.

  `lttbIndices` is exported from `@pyreon/charts/plot` alongside `lttb`, which
  keeps its `Pt[]` signature and its real-x semantics — collapsing the two would
  silently change what "largest triangle" means for unevenly spaced data.

  Because the arithmetic now crosses, the compiler stops claiming otherwise:
  `lttbIndices` and `minMaxBuckets` are exempt from the `@pyreon/charts/plot`
  web-only warning (beside `binValues`, same reason), and the `maxPoints` decline
  names the pre-decimation remedy instead of just saying "not lowered". `lttb`
  keeps warning — it takes `Pt[]`, which is why the arithmetic was split out of it.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts look right out of the box:

  - **Legend and colour by label** (web and native). Marks sharing a label share one legend entry, which toggles all of them, and one palette colour, as ECharts treats a series name. An area under a line, both labelled Revenue, no longer shows two Revenue swatches in two colours.
  - **Area marks** fill translucent (0.3) by default instead of opaque; the new `areaOpacity` mark option sets it.
  - **Charts follow the page's declared scheme.** They read the CSS `color-scheme` on `<html>` when it names one, else the OS preference, so a site with its own theme toggle gets matching charts.
  - **Dark gauges.** Under a non-default theme a gauge takes the theme's text and label colours instead of ECharts' light-theme greys.
  - **Candlesticks.** A candlestick's x labels thin and slant to what fits instead of overlapping, and its zoom's opening window is applied.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `smooth` and `step` are now exported from the `@pyreon/charts` root, so a `<Line curve={smooth}>` needs no `/engine` import. The docs, README and manifest examples now use the `<Chart>` grammar. The typed-channel claim is corrected: `<Chart<Row>>` checks its own channels, but a mark checks its field names only when given the row type (`<Bar<Row> y="revenue">`). The charts import migration routes `smooth`/`step` to the root.

- [#3197](https://github.com/pyreon/pyreon/pull/3197) [`17596f4`](https://github.com/pyreon/pyreon/commit/17596f490812099db424e6dd93ffa37f10f3b332) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dual y-axes at the engine level. A mark opts in with `axis: 'right'` (`MarkOptions.axis`, carried onto `Series.axis`); the right domain derives from right-axis series or pins via `ChartSpec.y2Domain`/`ChartToSvgOptions.y2Domain`, with its own `y2Format`. The right gutter is measured from the y2 tick labels exactly like the left one, the right axis line + `start`-aligned labels render when a right series exists, and each independent series scales against ITS axis. Three deliberate pins, none silent: stacked/grouped stay left (one stack, one scale), horizontal frames stay single-axis, and a chart whose EVERY series is right falls back to left. `chartToSvg` carries the options, so dual-axis charts work server-side today; the `PlotChart` prop plumb follows once the interaction wave lands.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Better chart defaults and a few long-requested grammar props.

  - **Palette.** The default palette is re-picked so every colour clears 3:1 against the background (WCAG 1.4.11, in both light and dark), and the first four series stay distinguishable under deuteranopia and protanopia. Light and dark keep the same hue per series. Charts that relied on the old default colours will change colour.
  - **`<Legend direct />`** labels each line at its last point, in the series colour, instead of drawing a legend box. Labels that would collide are nudged apart, and the plot reserves room on the right for them.
  - **`<Zoom window={{ start, end }} lock />`** opens a zoomed chart on a window and optionally pins its span.
  - **`<Cell visualMap />`** draws a continuous legend over the data's own extent in the theme's ramp; a `visualMap({ domain, … })` spec still works.
  - **`<Candle>` beside `<Zoom>`** opens its navigator on the given window.
  - **Typed marks.** `const RowBar = Bar<Row>` narrows `y` to `Row`'s keys with zero runtime cost, and the native compiler lowers the alias like the mark it names.

  All of these lower to iOS and Android.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A line with an area fill draws as ECharts does. It stays a line, with its stroke and symbols drawn over the fill; before, it was an opaque polygon with no line. The fill's opacity, colour and origin (`auto` closes to zero, or the nearer edge; `start`, `end` or a value) are configurable, so a range through zero closes to the zero line instead of the floor.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis tick labels sit where ECharts puts them: 8px off the axis, or on the plot's side when set inside. The y axis takes a label rotation, turning each label about its anchor, and its gutter holds the turned box.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's axes draw their lines, ticks and split lines as ECharts does. An axis shows its line and ticks only when the other axis is a value axis, and a category axis on bands drops its ticks. So a bar chart's value axis has no line, and a value-by-value scatter has both lines, ticks and vertical split lines. Axis line and tick visibility, tick length, inside ticks, `alignWithLabel` and line styles (colour, width, `dashed` / `dotted` / custom dash) are configurable, and the second y axis draws its own split lines. An axis line and its ticks move onto the other axis's zero when that range crosses it (ECharts' `onZero`, on by default); the labels stay at the edge.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine lays bars out the way ECharts does. A single series leaves ECharts' 31% category gap (was 25%). Grouped series use its `max(35 − 4 × columns, 15)%` category gap and 10% bar gap. `ChartSpec` takes `barWidth`, `barMaxWidth` and `barMinWidth` (pixels or percent), `barGap` (including `'-100%'` overlap) and `barCategoryGap`, and a stack is one column. `barsFor` now returns a stacked or grouped series' own rects, so a tooltip `position` and the focus ring find those bars. The native engine is regenerated.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bar labels sit and colour themselves as ECharts does. They sit inside the bar by default, and take a position (`top`, `bottom`, `left`, `right`, `inside*` and the inside corners) and a distance. An unstyled label takes zrender's automatic fill: light text haloed in the bar's colour inside it, dark text haloed in the background outside. The halo colour and width can be set. Text draw commands gain an optional halo (`stroke` and `strokeWidth`), painted by the web canvas, the SVG export and both native canvases.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine can lay a cartesian chart out on ECharts 6's default grid: the plot sits 15% from the left, 65 px from the top, 10% from the right and 80 px from the bottom, and grows only where an axis label would otherwise leave the chart (`outerBoundsMode: 'auto'`). The title, legend and zoom slider draw in the grid's margins instead of pushing the plot around.

  - **Line symbols:** a line series can show ECharts' `emptyCircle` at its data, and `showAllSymbol` is honoured. A crowded category axis keeps only the symbols at its label interval, as ECharts does. Empty symbols (`emptyCircle`, `emptyRect`, …) draw as a ring round the chart surface.
  - **Axis labels:** category x-axis labels thin by ECharts' own `calculateCategoryInterval` instead of rotating, and take an explicit rotation or interval.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Line series take their shape from ECharts. `smooth` draws ECharts' own Bézier per segment (0.5 for `true`, with `smoothMonotone: 'x' | 'y'`), instead of a monotone cubic. `step: true` / `'start'` now rises first, as ECharts does; `'middle'` and `'end'` are drawn too. `connectNulls` bridges a missing value instead of breaking the line.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Line and scatter labels sit where ECharts puts them: a line's above its symbol, a scatter point's inside it, both against the symbol's box and with the same automatic colours as bar labels. A line with no symbols shows no labels, as in ECharts.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A scrolling legend now pages as ECharts' does. When the entries overflow, they stay on one line, clipped short of the page controller at the end: a prev arrow, `{current}/{total}` and a next arrow, each arrow dimmed when there is no page that way. Pages break where ECharts breaks them, so an entry the edge cuts opens the next page. Clicking an arrow pages it.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine gains ECharts' own dataZoom slider (`slider-zoom.ts`). It sits under the plot, laid out in the whole chart. It draws the data shadow (padded 30% of the span), the window filler, 15px handles 1px inside the window ends, and the brush move handle above it. Pressing the move handle drags the window. `<CandlestickChart zoom>` draws it; `PlotChart`'s own navigator is unchanged.

- [#3596](https://github.com/pyreon/pyreon/pull/3596) [`812c47d`](https://github.com/pyreon/pyreon/commit/812c47df785ec793076d86ef32739f42c7e634e2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stacks now follow ECharts' `dataStack`, and negative values in a stack are no
  longer dropped. A stacked bar with a negative value used to lose that segment
  silently, and its value axis ignored the negatives. Stacks now diverge from
  zero as ECharts' default `stackStrategy: 'samesign'` does: positives up,
  negatives down. `stackStrategy: 'all' | 'positive' | 'negative'`,
  `stackOrder: 'seriesDesc'` and separate `stack` groups are honoured for bars
  and lines. Two differently named stacks used to share one
  running total. The engine exposes this as `stackLevels`,
  `layoutStackLevels(H)` and `stackLevelsExtent`; `layoutStackedBars(H)` and
  `stackedExtent` keep their signatures with the new, ECharts-default
  behaviour.

  Bars honour `barMinHeight`: a shorter bar grows to it from its base, clipped
  to the grid. `showBackground` draws a strip behind each bar in
  `backgroundStyle.color` and `opacity`.

  A `NaN` datum is an empty datum, like `null`: it leaves a gap instead of
  being zeroed with a warning.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's default tooltip rows show what ECharts shows: a header and, per value, a round colour swatch, the name, and the value in bold at the right, comma-grouped (`2,500`) unless a `valueFormatter` shapes it. The box is edged in the series colour for an item tooltip. A pie's family tooltip no longer appends a `(100%)` share.

  The rows are built by the new engine `renderTooltipRows` / `pieTipRowsWith`, so iOS and Android draw the same rows.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's value axes can tick exactly as ECharts does:

  - Zero stays in view unless the axis is scaled.
  - The interval is ECharts' `nice(span / splitNumber)`, which also steps by 3 (for example 0, 300, 600).
  - A lone minimum or maximum, or the data bound, pins that side, and a pinned bound is a tick of its own.
  - Labels group thousands (`1,500`).

  `PlotChart`'s ticks are unchanged. The engine gains `ChartSpec.ySplit`, `yZero`, `yMin`, `yMax`, `yMinData`, `yMaxData` and `Domain.step`, and the native engine is regenerated.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A value X axis (a scatter's, or a value-axis line's) now ticks as ECharts does. Zero stays in view unless scaled, the interval is ECharts' `nice(span / splitNumber)`, a minimum and maximum (including the data bounds) pin their side, and labels group thousands. Before, the axis spanned the raw data extent. An inverted axis now keeps its tick step. `ChartSpec` gains the x counterparts of the y-axis tick settings.

- [#3287](https://github.com/pyreon/pyreon/pull/3287) [`05f4b35`](https://github.com/pyreon/pyreon/commit/05f4b352ef34afed00ed218a7692cab1066e5af9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two cartesian variants in the engine: `Series.effect` draws two translucent halo rings under every point (the effectScatter look, frozen at a frame and scaled with the entrance), and `Series.symbol` + `symbolRepeat` draw bars as a stretched or repeated symbol (`rect` / `circle` / `diamond` / `triangle` — the pictorialBar look, repeating along the bar's own axis and dropping a partial last unit). Exposed on the mark options (`points(y, { effect })`, `bars(y, { symbol, symbolRepeat })`). The generated native chart engine carries both.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `Series.extras` (`[{ label, numbers | texts }]`): the tooltip lists the named extra values under the series value and the accessible table prints one column per extra.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Breaking:** `@pyreon/charts` is now Pyreon's own chart engine, and the ECharts wrapper that 0.51 shipped is removed.

  In 0.51 the package wrapped the ECharts library: `<Chart options>`, `useChart`, and the `/manual`, `/vite` and `/webview` (`ChartWebView`) entries. 0.52 replaces all of it. `<Chart>` is now the engine's component, composed from mark children over your own rows (`<Chart data={rows}><Bar y="revenue" /></Chart>`), and the wrapper is not moved to another entry — it is gone. There are no aliases.

  - `.` — `<Chart>` and its marks, the family components (`GaugeChart`, `RadarChart`, `TreemapChart`, `SankeyChart`, …), formatters, theme and linking, plus the data types those take.
  - `/svg` — `chartToSvg` and the `*ToSvg` family, server-safe.
  - `/engine` — layouts, hit tests, `PlotChart` and the rest of the engine; outside the stability promise.

  `echarts` is no longer a peer dependency, and the `tslib` Vite alias (`chartsViteAlias`) is no longer needed. There is no mechanical translation from an ECharts option to marks; `pyreon check` flags code still importing the 0.51 wrapper and names what to move to.

  On native, the compiler treats the main entry, `/engine` and `/svg` as the engine. The package's multiplatform tier moves from `web-only` to `shared`.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart>` events: `onClick`, `onDoubleClick`, `onContextMenu` (the datum under the pointer, -1 for a miss, independent of `selectedMode`) and `onRendered` (after each paint); the handle's `dispatch` accepts `showTip` / `hideTip` / `legendAllSelect` / `legendInverseSelect`, and the handle tracks the bound chart's `seriesCount`. The native compiler names the four new events as web-only.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The events/actions model for `<PlotChart>` (ECharts' `on(...)` / `dispatchAction`, Pyreon-shaped). `selectedMode="single" | "multiple"` pins a picked datum (click or keyboard Enter) with a heavy outline that stays and reports the pinned set through `onSelectChange` (GLOBAL indices); `onHighlight` reports the hovered datum and -1 on leave, `onLegendChange` the hidden series, `onZoom` the window — each from one source of truth, so a dispatch fires them exactly as a gesture does. `createChartHandle()` is the imperative handle: a link (`zoom`, `hover`) plus `selected` and `hidden` signals that ARE the chart's state, and `dispatch` over `highlight` / `downplay` / `select` / `unselect` / `toggleSelect` / `legendSelect` / `legendUnselect` / `legendToggle` / `dataZoom` / `restore`; a handle passed as `link` to siblings connects them. The engine draws the emphasis itself — `ChartSpec.emphasis` puts a faint band under the highlighted column and outlines its bars and points, a heavier outline on a pin — so the SVG and the generated native engines carry it in the same draw list. On native the new props warn by name (event props included, which the old filter never matched) and the chart renders without them.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<GanttChart>` + `layoutGantt` / `renderGantt` / `hitGantt` / `ganttToSvg` — the Gantt family: one row per task on a calendar-aligned time axis (day/week/month/quarter/year ticks picked by span), lane headers per group, progress insets, milestone diamonds, dependency elbows, a dashed today marker, an entrance progress, and the same reactive canvas host + accessible table as every other family.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The shared canvas host gains `itemTooltip`, `itemCursor` and `itemSilent` props, applied to the item a family reports through its new `item` hook, so a family chart's tooltip, cursor and hit-ability can be set per item. A family layer's box mirrors under `rtl`.

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The grammar covers the row-array families. `<Plot>` takes four family marks — `<Arc value label color? innerRadius?>` (pie / donut), `<Stage value label color? sort? gap? …>` (funnel), `<Cell x y value colors? gap?>` (heatmap) and `<Candle open high low close upColor? downColor? widthRatio?>` (candlestick, the plot's `x` channel labels each period) — and renders that family's host instead of the cartesian plot, channels as accessors, the mark's options where the host keeps them; `<Tip>`, `<Legend>` and `<Axis y format>` still apply. One family per plot: a second family mark, or a cartesian mark beside one, is reported and ignored. Two more cartesian children: `<Label text at series color radius>` declares the engine's datum-anchored point markers (`at="max"` / `"min"` / an index) and `<Rule x>` a vertical reference line. On native the compiler desugars a family plot to the host it names, byte-identical to writing that host directly, so the accessor inlining, the chrome, the tap and the entrance are inherited. `Label`, not `Text`: `<Text>` is the canonical primitive and the native compiler dispatches on the tag name.

- [#3186](https://github.com/pyreon/pyreon/pull/3186) [`17c081a`](https://github.com/pyreon/pyreon/commit/17c081ac92da8e44b8e63c36df03586fec781c5e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server-side SVG for the whole chart family: `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg` and `heatmapToSvg` join `chartToSvg` — pure functions over the engine's geometry with `measureApprox` by default, so every chart type renders in an SSG build, a serverless function or an email pipeline, with the same derived accessible title/description contract.

- [#3185](https://github.com/pyreon/pyreon/pull/3185) [`a7bc895`](https://github.com/pyreon/pyreon/commit/a7bc89534d33ad9a530f3f30bda987c103545fc8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The finance family joins the interaction contract: `CandlestickChart` gains `onSelect` (candle index; the full column is the hit target, because a wick is one pixel wide) and an OHLC `tooltip`; `HeatmapChart` gains `onSelect` (the tapped CELL — categories plus aggregated value, null for a miss, and an undrawn cell IS a miss because absence is not selectable) and a cell `tooltip`. New pure hit helpers `hitCandle` and `hitHeatCell` ship from the engine, so the same geometry answers native hosts.

- [#3210](https://github.com/pyreon/pyreon/pull/3210) [`33b353b`](https://github.com/pyreon/pyreon/commit/33b353bad8b67b652ed4bf9bb77a23a6ae886fc2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Funnel family: `layoutFunnel`/`renderFunnel`/`hitFunnel` (pure trapezoid geometry — descending/ascending/none sort that still names INPUT indices, per-stage taper toward the next stage, `minWidthRatio`, left/center/right alignment, entrance progress), `<FunnelChart>` (reactive canvas host with `onSelect` and the accessible table), `funnelToSvg` (server-safe).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<GaugeChart dial>` draws a gauge the way ECharts does, from a spec built by the new `gaugeDial()` builder:
  - the axis line in colour bands (colour stops, `roundCap`);
  - split lines, ticks and labels round the dial (lengths in pixels or percent of the radius, `auto` colours, label formatter / rotation);
  - a pointer and an optional progress arc per value (`overlap`, `clip`, `roundCap`);
  - the anchor, and each value's title and detail, with per-datum offsets;
  - the detail box (background, border, width, height, padding);
  - pointer and anchor icons (rect, circle, diamond, triangle, arrow);
  - start and end angles, direction, `min` / `max` and `splitNumber`.

  Text draw commands gain an optional `weight` ('bold'), drawn by the web canvas, the SVG string and both native canvases.

- [#3288](https://github.com/pyreon/pyreon/pull/3288) [`fea7fde`](https://github.com/pyreon/pyreon/commit/fea7fdea10cc31972eb08a9f3cfd8d8a012d1a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Points and paths on a map: `renderGeoPoints` + `renderGeoPaths` / `hitGeoPoint` / `geoPointRadii` / `geoPointsToSvg` draw scatter and effectScatter symbols through a map layout's projection (value-scaled radii, halo rings, opt-in labels).

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Linear gradients — `gradient` on a bar-family or `area` mark (ECharts' `LinearGradient` item and area style), the second command of DrawCmd v2. You give the stops and a direction; the engine resolves the two points against the PLOT box, so one ramp spans the chart instead of repeating inside every bar, and the same mark reads correctly at any size. The web canvas builds a `CanvasGradient`, the SSR SVG emits a `<linearGradient>` in `<defs>` with `gradientUnits="userSpaceOnUse"` and references it by id, SwiftUI fills with a `.linearGradient` shading and Compose with a `Brush.linearGradient` — all from the same `ChartGradient` in the draw list. Every gradient-bearing command still carries its solid `fill`, so a backend that cannot paint one, or a caller serializing commands without a `<defs>` to put them in, falls back to the colour rather than to nothing.

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **The grammar: `<Plot>` with mark children.** `<Plot data={rows} x="month"><Bar y="revenue" /><Line y="target" /><Axis y format={currency('$')} /><Tip /><Legend /></Plot>` — channels are FIELD NAMES (typed `keyof T`) or accessors, marks are JSX children (so layering is composition and a `<Show>` around a mark is ordinary Pyreon), and `<Rule>` / `<Axis>` / `<Tip>` / `<Legend>` / `<Zoom>` declare annotations, axes, the tooltip, the legend and zoom/navigator/presets/brush/linking as data. Marks are branded components `<Plot>` scans structurally (the `Switch`/`Match` precedent) and resolves into the `marks={[bars(…)]}` props `<PlotChart>` already takes — the array form stays the config form and the two are one spec. A `color` channel on `<Plot>` pivots long-format rows into one series per distinct value (categories from `x`, gaps where a pair is absent, bars grouped unless `stack`). `resolveGrammar` and `channel` are exported.

  Native: the compiler desugars `<Plot>` to the `<PlotChart marks>` element the plot host lowers — the grammar form emits byte-identical Swift/Kotlin to the array form — while the runtime `color` pivot and a stray mark outside `<Plot>` warn by name.

- [#3219](https://github.com/pyreon/pyreon/pull/3219) [`5346f90`](https://github.com/pyreon/pyreon/commit/5346f9015c57ee808a60556b76626d0a03636765) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Graph family: `layoutGraph` (DETERMINISTIC force layout — seeded PRNG, Fruchterman–Reingold repulsion/attraction with gravity and cooling, symbols clamped inside the box; `circular` and `none` (data coordinates) layouts; symbol radius by value; category colours; unknown-endpoint links dropped BY NAME), `renderGraph` (links width-by-value under symbols, opt-in labels, entrance converging from the centre), `hitGraph`, `<GraphChart>` (reactive canvas host, `onSelect(node)`, accessible table), `graphToSvg` (server-safe).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine gains optional plot insets on `ChartSpec` (`gridLeft`, `gridTop`, `gridRight`, `gridBottom`): they fix the plot rect, pixels or percent, and the axis labels draw in the margin. A bottom or right-hand legend takes its band off the chart, like the top legend always did.

- [#3147](https://github.com/pyreon/pyreon/pull/3147) [`7772578`](https://github.com/pyreon/pyreon/commit/7772578feeb1d87b4e82b8e2787d8fa0a3ab57c5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<CandlestickChart>`: open/high/low/close per period, direction by color
  (close vs open), a doji keeping a visible 1px body, the wick under the body.
  Geometry (`renderCandles`, `ohlcExtent`) exported standalone.

  `<HeatmapChart>`: two categorical axes, a value per cell, color as the third
  channel. First-seen category order (weekday names carry an order sorting
  destroys), duplicate observations sum, absent cells stay undrawn — absence
  and zero are different facts. The `#rrggbb` ramp interpolation is hand-rolled
  so the same code lowers to native, and the geometry (`buildHeatGrid`,
  `colorRamp`, `renderHeat`) is exported standalone like the rest of the
  engine.

- [#3383](https://github.com/pyreon/pyreon/pull/3383) [`8be3273`](https://github.com/pyreon/pyreon/commit/8be32737ba6dfaea2aeb170f091e47c4289c140c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stacked and grouped bars now render on the HORIZONTAL frame.

  They were filtered out of the horizontal render entirely, so
  `<PlotChart horizontal marks={[stackedBars(...), stackedBars(...)]} />` drew
  its axes and nothing else — and said nothing about it. A population pyramid, a
  ranked breakdown, a survey result: every one of them an empty box. The
  combination typechecked, the marks were accepted, and the only symptom was a
  chart with no bars in it.

  `layoutStackedBarsH` and `layoutGroupedBarsH` are the flipped-frame twins of
  the existing layouts: bands run down the y axis, values along x. They are
  separate functions rather than a flag inside the vertical ones because the two
  differ in every term — which plot dimension the band divides, which scale the
  value maps through, which rect edge a segment starts at — so a shared body
  would be a branch on `horizontal` at each of those points rather than shared
  arithmetic.

  The hit test moved with the paint. `stackedHitIn` returned -1 for any
  horizontal spec, which was correct while nothing was drawn and a dead control
  the moment something was; it now reads the same layout the paint used.

  The domain already handled this: a stack scales to its tallest TOTAL, and that
  calculation is frame-agnostic, so a horizontal stack whose total exceeds every
  individual series still fits inside the plot.

  Vertical output is byte-identical — no existing golden moved.

- [#3143](https://github.com/pyreon/pyreon/pull/3143) [`185739d`](https://github.com/pyreon/pyreon/commit/185739d7a8c21f1ccd08e68717e948ba452a2c64) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Horizontal bars: `<PlotChart horizontal>` puts categories on the Y axis with
  the left gutter sized by the widest category label (long names are the reason
  horizontal bars exist), grows bars rightward from the zero line — negative
  values leftward, the entrance animation included — and keeps the value
  formatter on the X axis. Bar marks only; non-bar marks are skipped rather
  than drawn as a misleading transpose. `chartToSvg` takes the same option.

- [#3359](https://github.com/pyreon/pyreon/pull/3359) [`6f79b9d`](https://github.com/pyreon/pyreon/commit/6f79b9d8ed021ec4f069009b95e26cb1a647d922) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot`: every family host gets the interaction stack `<PlotChart>` had alone, and the hosts stop re-laying out on every pointer move.

  - **Pointer events everywhere**: a finger drags, pans, brushes and pinch-zooms (`dataZoom`) as a mouse does; a tap shows the tooltip. `<PlotChart>` captures the pointer for a drag and sets `touch-action: none` only when it owns a gesture.
  - **Keyboard on every host** (`keyboard`, default on): the canvas is focusable, Arrow / Home / End walk the items the accessible table lists, each is announced in a polite live region and ringed where the family can place a ring, Enter / Space select through `onSelect` / `onSelectIndex`, Escape clears. The canvas is `aria-describedby` its table; the table stops at 1,000 rows and says so.
  - **Update animation on every host**: a same-shape data change tweens at the draw-list level (`tweenCmds`), so a treemap cell glides and a slice sweeps; a shape change snaps. `updateAnimation` / `updateDuration` on every host.
  - **Legend placement** (`legendPosition`: `top` / `bottom` / `left` / `right`) on every host and on `<Legend position>`.
  - **`yDomain`** on `<PlotChart>`; `<Axis y domain>` now pins the left domain (it was silently ignored — only `y2` read it).
  - **`dash`** on `line` marks.
  - **A missing measurement is a gap, not a zero**: `null` / `undefined` / `NaN` / an Infinity from an accessor skips the bar, breaks the line, draws no dot, stays out of the domain, and leaves the tooltip row and table cell empty (it used to plot as `0`). Write `d.v ?? 0` where zero is the truth.
  - **Toolbox on every host**: `toolbox={{ saveAsImage: true }}` saves the canvas as a PNG; `<PlotChart>` accepts `'svg' | 'png'` and `onSaveImage(data, format)`.
  - `GaugeChart` is built on the shared host (theme, title, description, table, keyboard). `CalendarChart` and `MapChart` gain `onSelectIndex`. `canvasHost` and its types are exported as the extension point for a family of your own; `RadarHitIndex`, `PointMarker`, the `*In` render/hit variants and the tween primitives are exported too.
  - `<Plot>` forwards the whole `<PlotChart>` surface (the events/actions model, `toolbox`, `seriesLabels`, `onSelectIndex`).
  - **Performance**: one `layoutChart` per frame (paint, crosshair, brush, focus ring and every hit test share it — a pointer move cost four to six); the family hosts hit-test the last draw's layout (a force-directed graph re-simulated on every mousemove); the navigator resolves its series once per data change and thins it to the strip's width; the accessible input is memoized; a decimated selection looks its row up in a map; `graphIndexOf` / `sankeyIndexOf` return at the first match; the canvas text measurer is memoized; animation frames are cancelled on unmount.
  - Native: the new props (`legendPosition`, `keyboard`, `updateAnimation`, `updateDuration`, `toolbox`, `onSaveImage`, `accessibleTable`, `yDomain`, `link`, `seriesLabels`) warn by name on iOS/Android instead of being dropped silently; the generated engine gains `renderChartIn` / `barsForIn` / `stackedHitIn` / `plotHitBarsIn` / `plotHitIndexIn` and the gap-safe bar layouts.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart>` host wave: keyboard navigation (the canvas is focusable; Left/Right/Up/Down move a focus datum drawn with a focus ring and announced in a polite live region, Home/End jump, Enter/Space fire `onSelect`, Escape clears — on by default, `keyboard={false}` opts out), update animation (a data change of the same shape tweens from the previous frame to the new one through the pure `tweenValues` helper, `updateAnimation`/`updateDuration`, reduced-motion aware), and `zoomPresets` (Highcharts-style range-selector buttons under the plot that set the dataZoom window to the last N rows). The canvas exposes `data-pyreon-zoom` and `data-pyreon-presets` as stable hooks.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The technical indicators are now `<Chart>` marks: `<Sma y window>`, `<Ema y window>`, `<Trend y>` and `<Bollinger y window k>` (a filled envelope `k` standard deviations wide, 2 by default, plus its middle line). They draw exactly what the array form's `sma`, `ema`, `trend` and `...bollinger` factories draw. Under a `color` pivot each series gets its own indicator over its own column. A mark with no `window` is skipped with a dev warning.

  Each indicator component carries its own factory, so a `<Chart>` without one does not bundle the indicator arithmetic. The resolver code shared by all indicators adds about 0.2 KB gzipped to `<Chart>` + `<Line>` (43.9 KB to 44.1 KB).

  On iOS and Android the compiler desugars the tags to the same `sma` / `ema` / `trend` / `...bollinger` calls, and the emit is byte-identical to the array form when `window` and `k` are numeric literals. The charts import migration lists the new names.

- [#3215](https://github.com/pyreon/pyreon/pull/3215) [`c50c972`](https://github.com/pyreon/pyreon/commit/c50c9729bc052cb31b612a4a538521580ecd2212) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Gaps and technical indicators. A non-finite series value is now a GAP: lines and areas break into runs at the gap (ECharts' `connectNulls: false`), points draw nothing there, and derived domains ignore it. `Mark.transform` derives a whole series from the resolved values, and `sma`, `ema`, `bollinger` (three marks: upper/middle/lower) and `trend` (least squares) ship as line marks whose warm-up positions are gaps, so an indicator starts where it is defined. Pure, Double-only math — lowers to native.

- [#3184](https://github.com/pyreon/pyreon/pull/3184) [`78e6bd0`](https://github.com/pyreon/pyreon/commit/78e6bd0dad0a92bdd939eda4f1708787ce1291db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Interaction wave for the plot engine: legend entries are now click-to-toggle (on by default with `showLegend`, opt out with `legendToggle: false`) — the domain rescales to the visible series, hidden entries render muted at their own hue, and the accessible table keeps every series because hiding is a visual focus tool, not a data edit. New `crosshair` prop draws a dashed rule through the hovered datum's column with a marker on each visible line/area/points series. `renderLegend` returns per-entry hit `boxes` and honours a `muted` flag on entries.

- [#3757](https://github.com/pyreon/pyreon/pull/3757) [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart by>`'s keyed geometry morph now covers stacked and grouped bars, horizontal charts, log scales and dual-axis charts, not only plain vertical bars and lines. Each frame of the morph is laid out and styled by the renderer's own code (the same stack, group, log and right-axis geometry, with corners, gradients, patterns and state fills), so the last morph frame is exactly the finished chart; an entering stacked segment grows from its own base rather than from the axis. Areas, bands, waterfalls, scatter and numeric-x charts keep the per-row value tween, as does an update that changes a series' kind or the chart's orientation.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart by>` now morphs geometry by key on plain bar and line charts, like D3's data join. A surviving row slides from its old slot to its new one, an entering row grows from the baseline in its new slot, and a removed row shrinks to the baseline in its old slot, so a sliding window visibly slides instead of jumping one slot on the first frame. Other chart kinds (stacked, grouped, horizontal, log, dual-axis) keep the per-row value tween.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart by="id">` (and `<PlotChart by={(d) => d.id}>`) gives rows an identity for update animation, like `<For by>`. A data change then tweens each row from its own previous value, and a new row grows in from the baseline (bars, areas) or appears in place (lines, points). A row-count change with `by` now tweens instead of snapping. Without `by`, rows are matched by position, so a sliding window used to animate every bar toward its neighbour's value.

  On iOS and Android, `by` warns by name: native update animation still matches rows by position.

- [#3416](https://github.com/pyreon/pyreon/pull/3416) [`81e52fb`](https://github.com/pyreon/pyreon/commit/81e52fb2c2c92596497f741cedb2398b426e2df7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Legend PLACEMENT crosses to native — `legendPosition` lowers, and an 8px divergence closes

  `chrome.ts` already crossed what a legend LISTS and what a tap SAYS. Where the
  legend GOES stayed in the web host as a four-branch block, so the native
  emitters drew every legend at the top and warned that `legendPosition` does not
  lower — and the one placement both targets did implement disagreed anyway: the
  emit drew the legend at `x: 0` across the full width while the web host inset it
  by 8 on each side and pushed the plot 8 further down.

  `placeLegend(entries, area, position, opts, measure)` in the crossing
  `legend.ts` is now the single implementation. The web host calls it, both
  emitters call it, and `legendPosition` (`top` / `bottom` / `left` / `right`)
  lowers on every host that draws its chrome through the shared seam — a side
  legend narrows and indents the plot on a phone exactly as in a browser, with the
  tap offset folded into the chrome's own `tapX` so no host can forget it.

  The four hosts whose engines draw their own frame (Gauge, Candlestick, Heatmap,
  Boxplot) do not read the prop and still say so. `legendColumnWidth` moved from
  the web host into `legend.ts` with it, and the runtime gained
  `pyreonShiftCmdsXY` for the two-axis offset a side legend needs.

  Separately, every unlowered `<PlotChart>` prop now says WHY. Sixteen of the
  nineteen warned with only their name — a status, not a reason — against this
  repo's own standard, which `<MapChart>`'s decline had a spec for and nothing
  held the rest to. The reasons divide deliberately into two kinds: a prop whose
  MECHANISM is the web platform (a DOM element, a hover, a download) and one that
  is EMIT WORK, so a reader can tell a wall from a backlog item.

  `<PlotChart>` carried its OWN copy of the four branches — a THIRD
  implementation — and the copies had already drifted: a top legend sat at
  `x: 0` there and `x: 8` in the family hosts, and a bottom one reserved
  `height + 4` against `height + 8`. Neither difference was reported by anything.
  It now calls `placeLegend` too, so the plot host, the sixteen family hosts and
  both native emitters share one placement.

- [#3200](https://github.com/pyreon/pyreon/pull/3200) [`b57c99f`](https://github.com/pyreon/pyreon/commit/b57c99fab1b1bcb9f8351861babd634282653d27) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Scrollable legend + title block. `renderLegend` gains `maxRows` and `page`: a legend that overflows the cap shows `maxRows` rows and a right-aligned pager (prev / current-of-total / next) whose arrows come back as hit rects in `LegendLayout.pager`; the second layout pass reserves the pager's width so the last visible row never runs under it, entries on other pages are not drawn and keep an EMPTY hit rect (w = -1) so `boxes` stays index-aligned, and an uncapped legend renders byte-identically to before. New `renderTitle(text, subtitle, box, opts)` lays out a title and optional sub-title block (start/middle/end alignment) and reports the height it consumed — the legend's contract — so a host shrinks the plot by exactly what was drawn.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Linked charts (ECharts `connect`): `createChartLink()` returns a shared `{ zoom, hover }` pair; pass it as `<PlotChart link>` to every chart in a group and wheel-zoom, pan, navigator drags, presets and the crosshair datum stay in sync across all of them. The host exposes `data-pyreon-hover` beside `data-pyreon-zoom`.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A line with more points than its plot has pixels is drawn from at most eight points per CSS pixel (M4: the first, lowest, highest and last point of each half-pixel column), which is how uPlot draws large series. A 1,000,000-point line on an 800px plot now strokes about 3,000 points instead of a million. Measured in real Chromium, the reduced line covers exactly the same pixels as the full one; antialiasing shade along a dense zigzag can differ slightly, because the full path overlaps itself hundreds of times per column. Horizontal charts and non-monotone point sets are drawn unchanged. iOS and Android use the same reduction.

- [#3288](https://github.com/pyreon/pyreon/pull/3288) [`fea7fde`](https://github.com/pyreon/pyreon/commit/fea7fdea10cc31972eb08a9f3cfd8d8a012d1a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Map family: `registerMap` / `getMap` / `listMaps` (ECharts' registry shape over GeoJSON FeatureCollections), `projectLonLat` (equirectangular or Mercator with polar clamping), `layoutGeo` (Polygon + MultiPolygon outer rings projected and fitted into a box with aspect preserved, north up, area-weighted centroids, per-region bboxes, a reusable `project` for overlays), `geoDomain`, `renderGeo` (fills through the shared heat ramp with a data or `visualMap` domain, an empty colour for regions without data, borders, labels only where they fit, fade-in entrance), `hitGeo` (bbox then point-in-ring), `<MapChart>` (reactive canvas host over a GeoJSON or a registered name, `onSelect(region)`, accessible table), `geoToSvg` (server-safe).

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's `Annotation` gains a segment form (`x1` / `y1` / `x2` / `y2`) for point-to-point lines, and `PointMarker.at` accepts `'average'` (the datum nearest the mean).

- [#3204](https://github.com/pyreon/pyreon/pull/3204) [`7da8b03`](https://github.com/pyreon/pyreon/commit/7da8b0396282e327630083826fb9b754b5cf7769) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Datum-anchored point markers — ECharts' markPoint, engine-shaped. `ChartSpec.markers` / `ChartToSvgOptions.markers` take `PointMarker[]`: anchor at a series' `'max'`/`'min'` or a concrete `atIndex` (clamped), with label above the point, colour/radius defaulting to the series' own. Markers draw OVER the series in painter's order, grow with the entrance `progress`, scale against the series' OWN axis (a right-axis series marks on the right domain), and skip joint layouts (stacked/grouped) and the horizontal frame rather than guessing — a marker with no anchor is skipped, the Annotation precedent. The anchor is split into two fields (`at` + `atIndex`) rather than one mixed string/number union deliberately: the split keeps the engine inside the native-compilable subset at zero caller cost.

- [#3376](https://github.com/pyreon/pyreon/pull/3376) [`9f271ae`](https://github.com/pyreon/pyreon/commit/9f271aeb2c28c58a04d443c945d30c8114a355ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every native chart canvas is now NAMED, and the plot host is DESCRIBED from its own data.

  A canvas is one opaque node to a screen reader. The web hosts have always answered that with the engine's `describeChart` sentence as the `aria-label` plus an offscreen table; natively only a `title` was ever applied — so an untitled chart was a blank rectangle to VoiceOver and TalkBack, and a titled one said its title and nothing about its data.

  - `a11y.ts` crosses with the engine (`ENGINE_FILES`), so `describeChart` / `chartTable` are generated into `PyreonChartEngine.swift` / `.kt` and both targets read the SAME sentence the web does. Its two subscript reads are bounds-checked for the native subset (a Swift subscript is never optional), which also fixes a real web edge: a series longer than the categories, or shorter than its siblings, now renders an empty cell instead of reading past the end.
  - Both emitters apply the label in the web host's order of precedence: an explicit `accessibilityLabel`, else the data description (the plot host, built from the series and categories the canvas painted and through the chart's own `format`), else `title`, else the family word (`chartDefaultLabel`: `PieChart` → "Pie chart", `PlotChart` → "Chart"). The description is emitted INSIDE the scope holding the hoisted series, which is the only place those bindings exist.
  - Device-asserted on both platforms: the tasks showcase's bar chart is queried for its label / content description and must carry the title, the series and the category count.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart brush onBrush>` lowers natively — the last gesture surface. `brush.ts` is now a crossing engine module (`brushRange`: a pixel span → a GLOBAL inclusive datum range under the window; `brushBand`: where a committed range sits on the plot through the window; `renderBrushBand`: the translucent band with dashed edges) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android a plain drag on the plot selects (the web's rule without `dataZoom`), the band is drawn inside the chrome wrap, a plain tap clears the selection, and a NAMED `onBrush` handler receives `BrushRange | null`. With `dataZoom` on, the web brushes on Shift+drag, which touch does not have, so that one combination stays web-only and warns by name; an inline `onBrush` arrow warns by name too (the brush still selects). `@pyreon/charts/plot` also exports `brushBand`, `renderBrushBand` and the `BrushRange` / `BrushBand` types.

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Native chrome parity for the family hosts.** `showTitle` / `subtitle`, `showLegend` and `tooltip` now lower on every generic and accessor host (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, funnel, pie) on both native targets — not only on the plot host. The legend's entries and the tooltip's lines come from ONE crossing module, `chrome.ts` (`treemapLegend`, `sankeyTip`, `pieTip`, … plus `renderTooltip`, which draws the box into the draw list), and the web canvas host now calls the same functions, so what a legend lists and what a tap says agree by construction. On native a tap shows the tooltip and a tap on nothing dismisses it; a host with a tap lays out ONCE (the paint and the hit used to compute the layout twice). `animate` is the one chrome prop still named as unlowered.

  PMTC: an annotated local (`const e: LegendEntry = { … }`) steers its object literal to the named struct — the field set alone picked a same-shaped sibling (`Slice` for a `TooltipRow`) or, with an optional field omitted, no struct at all (a tuple); `readonly T[]` / `ReadonlyArray<T>` lower like `T[]`; `keyof` / `unique` warn by name.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart dataZoom>` lowers to native: a pinch (SwiftUI `MagnificationGesture`, Compose `detectTransformGestures`) and a pan drive the engine's fraction window (`zoomWindow` / `panWindow`), the rows are sliced through `sliceRange`, accessors keep their GLOBAL index and `onSelect` reports global indices. `zoom.ts` is rewritten in the crossing subset (`sliceRange` returns a named `SliceRange` computed without `Math.floor` / `Math.ceil`) and crosses into the generated engine; `brushRange` moves to `./brush` (web). The Swift emitter gains a host-state splice: an expression host can register `@State` properties on its component.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Calendar geometry joins the generated native chart engine. `layoutCalendar` / `renderCalendar` / `calendarDomain` / `hitCalendarIndex` are rewritten Date-free (proleptic-Gregorian civil arithmetic in exact Doubles: `daysFromCivil`, `civilFromDays`, `weekdayOfDays`, `parseIsoDays`, `formatIsoDays` — all new exports) and bundled into `PyreonChartEngine.swift` / `.kt`. BREAKING for direct engine callers: `calendarDomain` and `renderCalendar` take a `CalendarValue[]` (`{ date, value }`) instead of a record — wrap a record with the new `calendarValues(record)`; `calendarDomain` returns a `Domain` (`{ min, max }`) and `CalendarOptions.domain` is a `Domain`, not a tuple; `CalendarLayout` gains `startDay` / `days`. `parseIsoDate` / `formatIsoDate` (epoch ms) and the nullable `hitCalendar` move to `engine/calendar-web.ts`, `calendarToSvg` to `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<CalendarChart values={record}>` are unchanged.

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The funnel family's geometry (`layoutFunnel` / `renderFunnel` / `hitFunnel`) joins the generated native chart engine — one TypeScript source, compiled by PMTC into `PyreonChartEngine.swift` / `.kt`, so a funnel lays out identically on iOS and Android. `funnelToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Gantt geometry joins the generated native chart engine, built on the calendar family's Date-free civil arithmetic. BREAKING (pre-1.0, clean API): time is DAYS since 1970-01-01 everywhere — `GanttTask.start` / `end` and `GanttOptions.today` are ISO `YYYY-MM-DD` strings only (epoch-ms values and the `Date.parse` fallback are gone; convert with `formatIsoDate`), `GanttOptions.domain` is a `GanttRange` (`{ start, end }`, ISO) instead of a tuple, `GanttLayout.domain` is a `Domain` (`{ min, max }` in days), `GanttRow.startMs` / `endMs` become `startDay` / `endDay`, `GanttRow.label` is the name string with `labelAt` beside it, and `GanttLayout.today` becomes `hasToday` + `todayX`. `ganttTicks` takes and returns days (`GanttTick[]`, `x` filled by the layout). The engine answers hits as an index (`hitGanttIndex`); the nullable `hitGantt` lives in `engine/gantt-web.ts` and `ganttToSvg` in `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<GanttChart>` are unchanged.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Graph geometry joins the generated native chart engine. `layoutGraph` / `renderGraph` are rewritten in the PMTC subset and bundled into `PyreonChartEngine.swift` / `.kt`. The force layout's PRNG is now a Park–Miller LCG in exact Double arithmetic (`graphNextSeed`, exported) instead of mulberry32 — still deterministic per `seed`, but a given seed produces a DIFFERENT arrangement than before. The engine answers hits as an INDEX (`hitGraphIndex`, -1 for none); the web-facing nullable `hitGraph` lives in `graph-hit.ts` and `graphToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderGraph` no longer takes a measurer. `GraphLayoutLink` gains `index` (position among the kept links) and `GraphLayout` gains `mode` (the layout that ran) — additive, and what keeps the crossed structs distinct from sankey's.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Heatmap and candlestick geometry join the generated native chart engine. `buildHeatGrid` / `renderHeat` / `hitHeatCell` and `ohlcExtent` / `renderCandles` / `hitCandle` are bundled into `PyreonChartEngine.swift` / `.kt`. The colour ramp is now a plain function, `rampColor(stops, t)` (new export); `HeatmapOptions.ramp` (a closure) is REPLACED by `stops?: string[]` (default `HEAT_RAMP`), and the closure factory `colorRamp(stops)` moves to `engine/heat-ramp.ts` (still exported from `@pyreon/charts/plot`, built on `rampColor`). `renderCandles`' options parameter is optional instead of defaulting to `{}`; `hitCandle` is now exported from `/plot`.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Parallel coordinates join the generated native chart engine — the last chart family to cross. BREAKING (pre-1.0, clean API): the engine takes NUMERIC rows (`Double[][]`; a category as its index in the axis's `categories`, a gap as `NaN`) — the web `ParallelRow` (`(number | string | null)[]`) is converted with the new `parallelRows(axes, rows)` (`<ParallelChart>` and `parallelToSvg` do this for you); `ParallelAxis.domain` and `ParallelLayoutAxis.domain` are `Domain` structs; the per-axis `place` closure is the function `parallelPlace(axis, value)` → `{ ok, y }`; `ParallelLine.points` is `Pt[]` with a parallel `present: boolean[]` (a gap is an absent point, not `null`) and `lineRuns(points, present)` matches; `ParallelOptions.lineColor` is a string only, with the per-row callback expressed as `lineColors: string[]` (`parallelLineColors(rows, fn)`, or `<ParallelChart rowColor={fn}>`). `hitParallelIndex` is the engine's hit; the nullable `hitParallel`, `parallelRows`, `parallelLineColors` and `lineRuns` live in `engine/parallel-web.ts`; `parallelToSvg` in `family-svg.ts`. The `@pyreon/charts/plot` re-exports are unchanged.

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Polar geometry (`layoutPolar` / `renderPolar` / `hitPolarIndex` / `polarTicks`) joins the generated native chart engine. The engine's hit answers indices (`PolarHitIndex`); the web-facing `hitPolar` + `PolarHit` union live in `polar-hit.ts`; `PolarLayout.lines` / `categoryLabels` / `ticks` are the named `PolarLine` / `PolarCategoryLabel` / `PolarTick`; `renderPolar` drops its unused measurer; `polarToSvg` moved to `family-svg.ts` (all still exported from `@pyreon/charts/plot`).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Sankey geometry joins the generated native chart engine. `layoutSankey` / `renderSankey` / `ribbonPoints` are rewritten in the PMTC subset (name lookups are scans, the relaxation stack/resolve steps are inlined, comparator sorts are insertion sorts, no `Infinity`) and bundled into `PyreonChartEngine.swift` / `.kt`. The engine answers hits as INDICES (`hitSankeyIndex` → `{ node, link }`); the web-facing `hitSankey` union lives in `sankey-hit.ts` and `sankeyToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderSankey` no longer takes a measurer (labels do not need one).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Tree and theme-river geometry (`layoutTree` / `renderTree` / `hitTree` / `linkPoints`, `layoutRiver` / `renderRiver` / `hitRiver` / `smoothPoints` / `layerPolygon`) join the generated native chart engine. `TreeLink` carries the entered node's `depth`; `RiverLayout.ticks` is a named `RiverTick`; `renderTree` drops its unused measurer parameter; `treeToSvg` / `riverToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Treemap and sunburst geometry (`layoutTreemap` / `renderTreemap` / `hitTreemap`, `layoutSunburst` / `renderSunburst` / `hitSunburst`, `nodeValue`, `treeDepth`, `tintHex`) join the generated native chart engine — squarify and the radial partition run from one TypeScript source on iOS and Android. `treemapToSvg` / `sunburstToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The entrance animation crosses. On the web, `animate` was wired on `<PlotChart>` only: the fourteen canvas-host families (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, parallel, funnel, map, boxplot, heatmap) took the prop and never passed the tween's progress to their engine, so they painted fully formed. Each now declares `animates` and hands `progress` to its render (`renderHeatChart` takes it as an optional trailing argument). Natively, both emitters render every host whose engine takes a `progress` — the same set — inside a new `PyreonChartEntrance` runtime view (SwiftUI `TimelineView`, paused once the tween ends; a Compose `Animatable`), which hands the cubic ease-out progress into `ChartSpec.progress`, into a copy of the host's `XOptions`, or as the heatmap wrapper's argument, over `theme.enterMs`; Reduce Motion on iOS and a zero animator scale on Android render at once, like `prefers-reduced-motion`. `animate={false}` emits the host exactly as before. An engine with no entrance (Pie, Radar, Candlestick, Gauge) now names `animate` as inert on every target instead of "not lowered on native".

  Two fixes the copy exposed: an inline options literal (`tree={{ symbolSize: 8 }}`) lowered to a synthesized `__Obj0` that swiftc rejected against `TreeOptions` — it is steered to the engine struct now — and a non-nil options value was read with optional chaining in the tooltip and hit paths, an error on a non-optional in Swift.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The candlestick and heatmap frames move into the engine — `candlestickFrame` / `renderCandlestickChart` / `hitCandlestickChart` and `heatGridFrom` / `heatPlotFor` / `renderHeatChart` / `hitHeatChart` (exported from `@pyreon/charts/plot`) — so the web hosts and the native canvas paint the SAME command list; both modules cross into the generated native engine. The native runtimes gain `pyreonChartMeasure` (UIKit / `Paint` text width in engine units), the measurer a laid-out frame needs. `<CandlestickChart>`, `<HeatmapChart>` and `<RadarChart>` lower to native (accessor bodies inlined; a `theme` override, a cell-shaped heatmap `onSelect` and `showLegend` warn by name).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `onSelectIndex` — selection on the family hosts in the form that crosses to native. Every lowered host (`<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`) takes `onSelectIndex`, which receives the engine's INDEX hit (`SankeyHitIndex` `{ node, link }`, `PolarHitIndex`, or a plain index with -1 for a miss) beside the web-shaped `onSelect`. On the web it fires from the same click; on iOS/Android the compiler lowers it to a tap gesture (`DragGesture(minimumDistance: 0)` / `detectTapGestures`) that hit-tests the same layout the canvas painted — the tap position divided by the display density on Android, where the draw list is laid out in dp. New engine exports `hitTreemapIndex`, `hitSunburstIndex`, `hitTreeIndex`, `hitRiverIndex` (the existing object-returning hits now wrap them); `@pyreon/native-cli` adds the `detectTapGestures` / `LocalDensity` Kotlin imports when the emit uses them.

- [#3403](https://github.com/pyreon/pyreon/pull/3403) [`d4e3a2f`](https://github.com/pyreon/pyreon/commit/d4e3a2ff77159bdfffb386313c4a7854fd07f7dd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `sma`, `ema` and `trend` lower to iOS and Android

  The indicator arithmetic moves to `indicator-values.ts`, which joins
  `ENGINE_FILES`, so `smaValues` / `emaValues` / `stdevValues` / `trendValues`
  cross to Swift and Kotlin. The emitters then recognise the marks the way they
  already recognise `bubble` → `bubbleRadii`: map the rows, hand them to the
  named engine function.

  The generic mark constructors stay web-only — PMTC cannot represent a type
  parameter, and the generator refuses an emit with warnings, so one generic
  function in the file would take the whole thing with it. That is why the split
  exists, and it mirrors `boxplot.ts` / `boxplot-chart.ts`.

  `bollinger` lowers too. It returns an ARRAY of marks, so it arrives as a
  spread element rather than a call, and the emitters expand it into the two
  Series it names — the envelope as a band (upper in `values`, lower in
  `values2`) and its middle line. Its edge arithmetic moved into the crossing
  module as `bollingerEdge`, which the web form now calls as well, so the two
  cannot drift.

  A non-literal window or width still warns by name rather than lowering
  something the emit cannot type, as does a spread of anything other than
  `bollinger`.

- [#3757](https://github.com/pyreon/pyreon/pull/3757) [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart by>` morphs by row key on iOS and Android. `by` lowers to the new `ChartSpec.rowKeys`; with it set, the engine tags every plain, stacked and grouped bar command with its row `key` and the `enter` rect it grows from (`growEdgeRect`, the same helper the web morph uses), and a line whose points are its rows one-to-one with `pointKeys`. `PyreonChartCanvas` on both platforms matches keyed commands by key: a surviving bar slides between slots, an entering one grows from its zero-side edge, an exiting one shrinks into it, and keyed line points move by key. Unkeyed charts and the web draw byte-identically. The compile-time warning that `by` was web-only is gone.

  The Kotlin stub extractor used by the native compile checks now ignores comments, so a parenthesis in a runtime data class's doc comment no longer truncates the class.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The legend and title blocks draw natively. `renderLegend` is rewritten in the crossing subset (`legendPlan` is a named top-level plan; `LegendPager.prev` / `next` are plain rects guarded by `hasPrev` / `hasNext` instead of `Rect | null`; the page label goes through `plain`), and it crosses into the generated engine together with `renderTitle`. The native runtimes gain `pyreonShiftCmds(cmds, dy)` — the web hosts' `shiftCmd`, which sits the plot below the chrome. `<PlotChart showLegend showTitle subtitle legendMaxRows>`, `<PieChart showLegend>` and `<RadarChart showLegend>` now emit the title block, the legend, and the plot translated down by both, with the tap offset to match; a host without the flags emits exactly what it did before.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart showLegend>`'s legend tap toggle and paging lower natively. The toggle rule is now an engine module (`legend-toggle.ts`: `legendToggle` / `hideHiddenSeries` / `legendHitIndex` / `pagerHit`) that the web host consumes — a hidden series keeps its slot, stacked/grouped series are zeroed rather than emptied, exactly as before — and that generates into `PyreonChartEngine.swift/.kt`. On native the hidden set and the legend page are host state; a tap on an entry toggles it, the entries render muted, `legendMaxRows` pages through the pager arrows, and a tap is resolved pager → entry → preset → selection, the web's order. `legendToggle={false}` keeps the legend inert on every target.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart navigator>` — the slider dataZoom — lowers natively. The strip is now an engine module (`navigator.ts`: `renderNavigator` over the first series across every row, `navigatorHit` for what a press grabs — band, left or right handle — and `navigatorDrag` for the window a drag produces) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android the drag rides a dedicated overlay above the strip (a clear SwiftUI layer / a Compose Box with `detectDragGestures`), so it never competes with the plot's pinch and pan, and it writes the same host window the pinch, the presets and the row slice read. The Android build now imports `detectDragGestures` (and `detectTransformGestures` for the pinch) for the real Gradle build — both live outside the star-imported packages and the stub gate could not see them missing.

- [#3362](https://github.com/pyreon/pyreon/pull/3362) [`0295aaa`](https://github.com/pyreon/pyreon/commit/0295aaaac118b3f8716a09b2549179be3110e8a0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` on iOS/Android — the native side of the host-parity audit.

  - **A bare host follows the runtime colour scheme.** With no `theme` and no `<ChartThemeProvider>`, a chart on the web follows `prefers-color-scheme`; on a phone it was hard-wired to the light theme, silently. Every field the two built-in themes disagree on now lowers to a runtime conditional over SwiftUI's `colorScheme` environment / Compose's `isSystemInDarkTheme()`; sizes and timings stay literals; a named theme or a provider scope pins it as before.
  - **`<BoxplotChart>` crosses**: its `fiveNumber` reduction and the whole frame (`boxplot-chart.ts`) are generated into both engines; the host lowers with an entrance, a tap per band and the theme. `boxplotToSvg` moves to `boxplot-svg.ts` (same export from `/plot`); `boxplotFrame` / `renderBoxplotChart` / `hitBoxplotChart` are exported.
  - **`<RadarChart>` gets a tap on both targets** (`onSelect` / `onSelectIndex` receive the engine's `{ series, axis }` hit) — it had none on either.
  - **What does not cross says so**: a rich-hit `onSelect` on the eleven table-driven hosts warns and names `onSelectIndex` (it vanished); `<ParallelChart tooltip>` warns (the policy claimed it lowered); `<MapChart>` declines by name instead of falling into the generic component emit as a symbol no target has.
  - The Kotlin frame hosts (Heatmap, Candlestick, Boxplot, Radar) key their tap on the vals it captures, so a tap after a data change resolves against the current geometry (`pointerInput(Unit)` kept the first composition's).
  - Device assertions in the tasks showcase on both platforms: a tap on the radar's first vertex reports series 0 / axis 0, a tap per boxplot band reports its index.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart marks>` — the cartesian family — lowers to native. Each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points`, literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `renderChart` paints it; `onSelect` taps the new engine `plotHitBars`, which the web host's click now uses too (`plotHitIndex` for its tooltip), exported from `@pyreon/charts/plot` and crossing into the native engine. A `bubble` mark, a `curve` option, the legend / title / zoom / brush / navigator surfaces, formatters and a `theme` override warn by name.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The remaining `<PlotChart>` inputs lower to native: a literal `theme={{ … }}` merges over the default theme (Candlestick and Heatmap hosts too); `format` / `xFormat` / `y2Format` lower as the engine's formatter by name (`compact`), a factory call (`fixed(1)`, `currency`, `percent`) or a closure; a `bubble` mark carries area-mapped radii through the new engine `bubbleRadii` (which `resolveMarks` now uses on the web). What still warns by name on native: `dataZoom`, `brush`, `navigator`, `zoomPresets`.

- [#3162](https://github.com/pyreon/pyreon/pull/3162) [`c6b2fb6`](https://github.com/pyreon/pyreon/commit/c6b2fb6de327d70f4538e8e46ef06424f478b827) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Engine: `formatTime` is now pure UTC epoch math (civil-from-days) instead of local-time `Date` getters — one shared source labels the same timestamp identically on web, iOS and Android, and the function lowers under PMTC (`new Date` is a class-construction bail). This changes default time-axis labels from device-local time to UTC; a locale/zone-aware label remains a `Formatter` the caller supplies. Also: `timeTicks` binds its formatter coalesce-first (an optional closure call does not narrow through a ternary in Swift), `fitCircle` returns a NAMED `Circle` type (an inline object return annotation lowers to a mismatched tuple), and locals that shadowed `Math.max`/`Math.min` call names are renamed (Swift scoping rejects the shadow JS allows).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine gains ECharts' default tooltip rows for cartesian charts and funnels: `tooltipAxisCells`, `tooltipItemCells` and `funnelTipRowsWith`. An item tooltip shows the series under the pointer or tap, an axis tooltip a row per series, and a series with no name shows no generated "Series 1". They are generated into the native engines, so iOS and Android show the same rows. A formatted tooltip keeps the plain lines on native, since native runs no formatter function.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart zoomPresets>` lowers natively. The preset strip is now an engine module (`presets.ts`: `renderPresets` / `presetHit` / `presetWindow` / `presetIsActive`) that the web host consumes — the strip it paints is byte-identical — and that generates into `PyreonChartEngine.swift/.kt`, so iOS and Android lay out and hit-test the same buttons. On native a tap on a preset writes the host's window (re-anchoring an active pinch when `dataZoom` is on too); presets bring the window state with them even without `dataZoom`. A non-literal `zoomPresets` value warns by name and renders the chart without the strip.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart navigator>` — the slider dataZoom: a strip under the plot shows the first series over ALL rows with the zoom window as a band; drag the band to move the window, drag a handle to resize it (window math shared with the wheel/pan zoom, minimum span enforced). Works with or without the inside `dataZoom`; the strip rect is exposed as `data-pyreon-nav`.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Numbers read as ECharts shows them: axis ticks, tooltips, the spoken description and the accessible table now group thousands by default (`60,000`, not `60000`), matching ECharts' `addCommas`. `currency('$')` groups too (`$60,000`). Series value labels are unchanged, since ECharts' `{c}` shows the raw value, and an explicit `format` still wins everywhere.

  A `<Band>`, and the envelope of `<Bollinger>`, now fills translucently by default (opacity 0.3, as `<Area>` does) instead of opaquely in the palette colour, which hid the lines drawn over it. `areaOpacity` sets it.

  The generated Swift and Kotlin chart engines are regenerated, so iOS and Android show the same numbers.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Breaking:** `<Chart>` has one selection callback, `<Tip>` is `<Tooltip>`, and the pie, funnel, heatmap and candlestick are marks.

  - `<Chart onSelect={(i) => …}>` receives the index of the drawn item on the web, iOS and Android: the row for the cartesian marks, `<Arc>`, `<Stage>` and `<Candle>`, and the cell for `<Cell>`. `<Chart onSelectIndex>` is removed. Over `<Cell>`, `onSelect` used to receive the heatmap host's cell object on the web and could not lower on native; it is now the cell index everywhere.
  - `<Tip>` is renamed `<Tooltip>` (`TipProps` → `TooltipProps`).
  - `PieChart`, `FunnelChart`, `HeatmapChart` and `CandlestickChart` leave the main entry for `@pyreon/charts/engine`. Write `<Chart data><Arc value label /></Chart>`, `<Stage>`, `<Cell>` or `<Candle>` instead. The family components with no row-per-datum shape (gauge, radar, treemap, sankey, …) stay in the main entry.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart>` bundles only the interactions and hosts its children use.

  - **`<Toolbox>` replaces `<Chart toolbox={…}>`** (breaking). The child takes the same config: `<Toolbox saveAsImage restore magicType={['line', 'bar']} />`.
  - `<Zoom>` carries the navigator, presets and range brush, and `<Toolbox>` carries the tool strip, SVG save, magic type and area brushes. A chart without them references none of that code.
  - Every cartesian mark carries the plot host. A family-only chart, such as a pie through `<Arc>`, no longer bundles the cartesian plot.

  Measured on the built main entry, gzipped: `<Chart>` + `<Line>` drops from 47.8 KB to 43.8 KB, and `<Chart>` + `<Arc>` from 52.7 KB to 24.5 KB. `<PlotChart>` (`/engine`) is unchanged and still carries every feature. On native, `<Toolbox>` desugars to the `toolbox` config the host already lowers, and the emit is identical to `<PlotChart toolbox>`.

- [#3221](https://github.com/pyreon/pyreon/pull/3221) [`2930393`](https://github.com/pyreon/pyreon/commit/29303935bebca3bac86a4a9b125b6dc648a1ee37) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Parallel-coordinates family: `layoutParallel` (evenly spaced vertical axes; value axes linear with data or fixed `domain` and `inverse`, category axes by position; nulls and unplaceable values become gaps; per-row or constant line colour), `lineRuns`, `renderParallel` (rows as translucent polylines, `highlight` rows drawn last and opaque, axes/ticks/names, left-to-right entrance), `hitParallel` (nearest segment within a tolerance), `<ParallelChart>` (reactive canvas host, `onSelect(line)`, accessible per-axis table), `parallelToSvg` (server-safe).

- [#3140](https://github.com/pyreon/pyreon/pull/3140) [`0f0cc85`](https://github.com/pyreon/pyreon/commit/0f0cc85ab42bd0dfa6ee04a48b3b7c5b38d7b6a0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The plot engine's first parity wave: curves, annotations, bubbles, value
  labels, and an entrance animation.

  - `smooth` and `step` curve interpolators, passed as imported bindings
    (`line(y, { curve: smooth })`). `smooth` is monotone cubic — it never
    invents an extremum the data does not have. A curve is a polyline
    densifier, so every backend gets it for free.
  - `annotations` on `<PlotChart>` and `chartToSvg`: dashed reference rules at
    a y or x value, translucent bands between two, each with an optional label,
    placed by the same scale the axis is labelled with.
  - `bubble(y, r)` sizes points by a second channel, mapped by AREA rather than
    radius — radius-proportional bubbles exaggerate the data.
  - `bars(y, { showValues: true })` labels each bar with its formatted value; a
    negative bar's label goes under the bar.
  - An entrance animation, on by default and off under `prefers-reduced-motion`
    or `animate: false`. Implemented as `ChartSpec.progress` — a pure engine
    parameter the host tweens, so every frame is testable and native backends
    will animate with no animation code of their own.
  - `line` and `polyline` draw commands take an optional `dash`.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add backend-neutral repeating pattern fills for bar and area marks, rendered consistently by canvas, SVG, SwiftUI, and Compose.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine lays a pie out the way ECharts does. `layoutArcsWith` and `ArcConfig` take the start and end angles, direction, minimum and pad angles, rose type and the zero-sum rule. The new `pie-labels` module places the slice names outside the pie on two-part guide lines, pushed apart so they never overlap and cut with an ellipsis when they would leave the chart. The native engine carries the same maths. A hit on a pie now reports the slice's input index when a slice before it draws nothing.

- [#3128](https://github.com/pyreon/pyreon/pull/3128) [`2d34a98`](https://github.com/pyreon/pyreon/commit/2d34a98fa5dd90cc957822b4d5f1bfe9992a18c4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `@pyreon/charts/plot` — Pyreon's own charting engine, with no third-party
  chart library behind it.

  The geometry is pure TypeScript over plain data and renders to a flat
  `DrawCmd[]` that a short platform backend executes. The web backend ships here
  as ~120 lines against a 2D canvas; the same command list is what will drive
  SwiftUI `Canvas` and Compose `Canvas`.

  Covers bars, lines, areas, points, scatter with real x/y channels, stacked and
  grouped bars, pie and donut, gauge, and radar; linear, log and time scales; nice
  ticks, legends with wrapping, tooltips with edge flipping, and compact/currency/
  percent formatting. Large series decimate with LTTB, which preserves spikes that
  nth-sampling drops.

  Authoring is marks over data rather than one nested option object:

  ```tsx
  import { PlotChart, bars, line } from '@pyreon/charts/plot'

  ;<PlotChart
    data={() => sales()}
    x={(d) => d.month}
    marks={[bars((d) => d.revenue), line((d) => d.target, { color: '#b45309' })]}
    title="Monthly revenue"
    seriesLabels={['Revenue', 'Target']}
    height={240}
  />
  ```

  Every mark is an imported binding, so a bundler drops the ones you never import
  — a bar chart pays nothing for the radial trigonometry or the time scales.
  Accessors are typed against your row type, so a wrong field is a compile error
  rather than a blank chart.

  Charts are accessible by default: the canvas carries a generated description
  naming the trend and range, and an offscreen data table lets a screen reader
  navigate the numbers by row and column. Opt out with `accessibleTable={false}`.

  Three components ship: `<PlotChart>` for the cartesian family, `<PieChart>`
  for pie and donut, and `<GaugeChart>`. They are separate rather than one
  component with a `type` prop, because a pie has no cartesian plot — no axes, no
  gutters, no shared domain — and folding them together would make every bar chart
  carry the radial trigonometry it never uses.

  `<PlotChart>` also does legends, hover tooltips, stacked and grouped bars, a
  per-series default palette, and fills its container when no width is given.

  A second backend renders the same command list to an `<svg>` string. It is a
  pure function, so `chartToSvg(...)` produces a chart in an SSG build, a
  serverless function or an email pipeline — no DOM, no canvas, no measurement
  context — and its output is deterministic, which makes an SVG snapshot a real
  assertion rather than a flake.

  `<PlotChart>` fills its container and follows it: the width comes from the
  container via a `ResizeObserver`, not from the canvas the chart itself sizes.

  A single `format` prop covers the y-axis ticks, the tooltip and the spoken
  description — `plain`, `compact`, `currency`, `percent` and `fixed` ship with
  it.

  `xValue` places points by their own value rather than by index, with `xTime`
  for calendar tick labels — an irregular time series spaced evenly is the chart
  stating something false about the data, so this is a correctness feature.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` now exports the whole family set: treemap / sunburst / tree (one `TreeNode` shape), sankey / graph, funnel / boxplot, calendar / parallel / polar / single axis / theme river / map + geo points and paths, the dataZoom window math and the title block. Manifest entries (`TreemapChart`, `MapChart`) feed the MCP reference; the docs page and README gain the family and coordinate sections.

- [#3204](https://github.com/pyreon/pyreon/pull/3204) [`7da8b03`](https://github.com/pyreon/pyreon/commit/7da8b0396282e327630083826fb9b754b5cf7769) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `PlotChart` gains the props the engine waves prepared: `y2Domain`/`y2Format` (right axis for marks with `axis: 'right'`; the crosshair places right-axis markers on their own domain), `markers` (datum-anchored point markers), `legendMaxRows` (paged legend with clickable prev/next arrows), `showTitle`/`subtitle` (a heading block that consumes height above the legend), and `tooltipFormatter` (replace the tooltip text from the resolved content). Also a correctness fix: pointer handlers now hit-test in PLOT space — the plot is drawn shifted below the title/legend, and hit rects were computed against the unshifted full-height layout, so with a legend shown a click just above a short bar reported a hit and a click inside a tall bar's upper part could miss.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Scatter and effectScatter series render on the polar coordinate (`PolarSeries.kind: 'scatter'`, `radius` from `symbolSize`): points at the line placement, circles only, hittable like line points — on web, iOS and Android.

- [#3224](https://github.com/pyreon/pyreon/pull/3224) [`bbf1800`](https://github.com/pyreon/pyreon/commit/bbf18000b9de9ee96b2044a2ad32aa42cf863c70) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Polar coordinate: `layoutPolar` (categories on the ANGLE axis → radial bars in equal slots, grouped side by side or stacked along the radius, plus polar lines at slot centres; categories on the RADIUS axis → concentric arc bars sweeping by value; hole via `innerRatio`, `startAngle`, `clockwise`, fixed or data value domain, nice ticks), `renderPolar` (grid rings/spokes, sectors via the shared arc tessellation, lines + points, rim labels, entrance that grows bars and draws lines), `hitPolar` (sector, then nearest line point), `<PolarChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `polarToSvg` (server-safe).

- [#3180](https://github.com/pyreon/pyreon/pull/3180) [`559e5f7`](https://github.com/pyreon/pyreon/commit/559e5f769d00d51c135399ed901fde4484009bd8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<RadarChart>` joins the plot engine's component family — one polygon per datum over shared spokes, each axis normalised by its own max so mixed-unit axes stay comparable. Ships with the same accessibility contract as its siblings (derived `aria-label` + offscreen data table), an optional wrapping legend, translucent fills with full-strength outlines, and the shared radial host sizing (parent-measured width + resize observer), which is now extracted to one module so the pie/gauge/radar trio cannot drift apart again.

- [#3177](https://github.com/pyreon/pyreon/pull/3177) [`f22774f`](https://github.com/pyreon/pyreon/commit/f22774ffe70af6d7be01313b27eefdbb97bd0a8f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PieChart>` and `<GaugeChart>` from `@pyreon/charts/plot` cross to native: PMTC lowers them to the new runtime `PyreonPieChart` / `PyreonGaugeChart` views (SwiftUI + Compose), drawn by the generated `PyreonChartEngine` — web and native render the same byte-locked geometry. Accessor props pass through as closures (the wrappers are generic over the row type, with `Number`/`Int` seams for integer columns), `data-testid` + a11y ride the special-emitter tail, and the decline paths warn by name (an `(d, index)` accessor, missing required props, the web-only legend/hit-testing surface). The charts manifest now declares `nativeFrontend`, so subpath imports of the web-only components (`PlotChart`, heatmap, candlestick) get the per-package advice instead of silence — the symbol-level warn table lookup is root-normalized (`@pyreon/charts/plot` matches the `@pyreon/charts` entry).

  The diagnose catalog teaches the unlowered-chart-tag error: `cannot find 'PieChart' in scope` / `Unresolved reference 'PlotChart'` now explains the radial decline paths and the web-only cartesian family, with the `<Web>` remedy.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts` no longer carries an ECharts-compatibility layer. It is Pyreon's own engine only: `<Chart>` with mark children, the family components, `/svg` and `/engine`.

  - The chart engine drops every `Series` / `ChartSpec` field and helper that only an ECharts option could set: the ECharts bar layout and nice-domain algorithm, label placement and rich text, emphasis/select/blur states, extra and secondary x axes, axis-line / tick / minor-tick / split-area options, grid insets, inverse axes, pictorial symbol layout and the `lines` series. None of them was reachable from `<Chart>`; the generated native engines shrink by the same amount.
  - `<FunnelChart echarts>` is removed; `funnel` covers sorting and alignment.
  - `<GaugeChart dial>` takes a spec built with the new `gaugeDial({ data, … })`, every part defaulted. On iOS and Android `dial` now warns and draws the half-circle track.
  - `visualMap` on `<HeatmapChart>`, `<CalendarChart>` and `<MapChart>` takes a spec built with the new `visualMap({ domain, … })`, which also lowers to native.
  - `<CandlestickChart zoom>` takes a `CandlestickZoom` whose fields are all optional (`inside`, `slider`, `window`, `lock`, `minSpan`, `maxSpan`).
  - `ChartHandle` loses the timeline (`step`, `playing`, `timelineChange`, `timelinePlayChange`), which only an option chart had; the native `PyreonChartHandle` follows.
  - `tweenCmds` passes `clip` / `unclip` through instead of dropping them.

  The native compiler drops the `<OptionChart>` and `<ChartWebView>` lowering. `pyreon/no-web-only-import-in-portable` no longer flags `@pyreon/charts`, which draws natively.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis tick density now follows the chart's size: about one value tick per 40px of plot height (per 80px of width for a horizontal chart's value axis and for a numeric x axis), between 2 and 10. A phone-width chart no longer crowds six labels into 120px, and a tall dashboard chart is no longer left with five. The value domain is rounded to the same step, so the top of the axis is always a labelled tick. Charts whose size differs from the old five-tick sweet spot will show a different number of ticks.

  `<Axis y ticks={n} />` and `<Axis x ticks={n} />` pin the target (`yTicks` / `xTicks` on the spec). Both lower to iOS and Android.

- [#3528](https://github.com/pyreon/pyreon/pull/3528) [`a89478f`](https://github.com/pyreon/pyreon/commit/a89478f3043fdc1a7eeb83215102c17570acfe90) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Series labels are a first-class engine module: `label.formatter` takes ECharts' `{a}` (series name), `{b}` (category), `{c}` (value) and `{d}` (share of the series total) as well as a function; `label.color` and `label.fontSize` style the label; `\n` breaks a line; and `label.rich` names the styles a `{name|text}` segment can take, laid out about the same anchor a one-line label uses. A plain label still emits exactly one text command, so nothing changes for the common case. What a rich style changes beyond a colour and a size is named rather than ignored.

- [#3444](https://github.com/pyreon/pyreon/pull/3444) [`ee4c24d`](https://github.com/pyreon/pyreon/commit/ee4c24db934d6d2d5d27b74c545c6b8dc2cb1ccb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - River's axis and tick labels now read the chart theme, and the SVG⇄canvas theme
  gate is total over every family helper.

  `riverToSvg` accepted a `theme` documented as "the canvas host reads the same
  fields" and then passed only the palette, so a dark river drew its axis in a
  fixed `#94a3b8` and its tick text in a fixed `#64748b` — 3.73:1 on the dark
  ground, below the 4.5:1 text minimum. `RiverChart` did the same. Both now pass
  `axisColor` and a new `tickColor`, and every value clears its WCAG minimum on
  both grounds; on the light ground the axis moves from a failing 2.56:1 to
  3.05:1. Band labels stay white, because they sit on a palette-filled band.

  The reason it survived: `svg-theme-parity.test.ts` covered ten of the sixteen
  `*ToSvg` helpers by hand, and all six it missed were where every remaining
  unthemed literal lived. The table is now checked against the module's own
  exports, so a helper with no case fails by name.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rounded bars — `borderRadius` on a bar-family mark (ECharts' `itemStyle.borderRadius`), the first command of DrawCmd v2. A number rounds all four corners, `[topLeft, topRight, bottomRight, bottomLeft]` rounds them individually, and the radius travels in the draw list as `corners` on the rect command rather than in any one backend: the web canvas traces four arcs, the SSR SVG emits a path of the same four arcs, and the SwiftUI and Compose canvases build the same path from the same clamped numbers. The clamping lives in the ENGINE (`cornerRadii`, half the shorter side), so it crosses to native with the generated engine and a bar animating up from the zero line rounds proportionally on all four backends instead of by four platform conventions. A mark without `borderRadius` emits no `corners` key at all, so existing charts serialize byte-identically.

- [#3379](https://github.com/pyreon/pyreon/pull/3379) [`7e489de`](https://github.com/pyreon/pyreon/commit/7e489de122f59b4e4e8db032a61a254ed0e10019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Right-to-left charts: `rtl` on `<PlotChart>` and every canvas host, and on the
  static `chartToSvg` path.

  RTL is implemented as a MIRROR of the finished draw list about the canvas's
  vertical centreline rather than as a flag threaded through layout and every
  mark. Mirroring about the CANVAS centreline (not the plot's) is what swaps the
  gutters, so no layout code changes: a measured value-label gutter lands as a
  right gutter of the same width. Bands run from the right, the legend's swatch
  sits right of its label, and a line reads from the right — all of which are
  the same fact, which is why one seam produces them together.

  Text is repositioned, never reversed. What flips is the anchor, a rotated
  label's angle, and a rect's corner radii.

  Every pointer is mirrored back before it is hit tested, so a click, a hover,
  the legend pager, the preset strip and a brush all still report the thing
  under the finger. A chart that painted mirrored and reported unmirrored would
  name the wrong bar in one locale only.

  Native lowers through `pyreonMirrorCmds` in both runtimes, hand-written per
  target for the same reason `pyreonShiftCmds` is (the draw command is a union
  in TypeScript and a flat struct on native). All three implementations are
  executed against the same commands and compared, so they cannot drift.

  On native both halves live on the CHROME helper — `mirror` beside `tapX` —
  so every host built through it (the plot, treemap, sankey, pie, polar, gantt,
  radar, …) gets the paint and the pointer together rather than each emitter
  remembering to take both. The three hosts whose emitters bypass the chrome
  (gauge, candlestick, heatmap) name `rtl` as unlowered instead of dropping it,
  and carry explicit prop lists so that adding a prop to the shared default can
  never silently claim a host that does not read it.

  Cost: the mirror is a static import of every canvas host, so a chart that
  never sets `rtl` still carries it — measured +86 B gz on the pie import and
  +31 B on the SVG one. That is the trade for `rtl` meaning the same thing on
  every host: putting the mirror behind an opt-in import would make the prop
  silently do nothing unless the consumer also imported the seam, which is the
  typed-but-unimplemented shape this PR otherwise avoids.

  Also closes two of the three limits this batch started with:

  `<Histogram>` now crosses. It was named web-only because it is not a mark —
  it REPLACES the plot's rows with bins — so the native form is that same
  substitution expressed in the IR: the row basis becomes
  `binValues(rows.map(x), bins)`, the category is the engine's own `binLabel`
  (newly shared with the web `histogram()` helper, so the two cannot label a
  bin differently), and the mark is an ordinary bar over `count`. Everything
  downstream — tooltip, accessible table, selection — comes from paths that
  already worked. Kotlin needed the channel widened through
  `pyreonChartDouble`, which the Swift runtime already had and the Kotlin one
  now does: PMTC types a bare `number` as Int, so an un-widened map is a
  `List<Int>` that `binValues` refuses. kotlinc catches that; swiftc does not.

  `locale` and `facet` stay web-only, and now say WHY rather than "not lowered
  yet": `locale` formats through `Intl`, which the crossed engine cannot call,
  and `facet` renders a grid of sub-plots rather than a chart setting. "Yet" is
  the right word for work not done and the wrong word for a mechanism, because
  a reader waits for a release that is never coming.

- [#3219](https://github.com/pyreon/pyreon/pull/3219) [`5346f90`](https://github.com/pyreon/pyreon/commit/5346f9015c57ee808a60556b76626d0a03636765) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Sankey family: `layoutSankey` (columns by longest path with cycle back-edges, self-loops and unknown endpoints dropped BY NAME rather than silently; node bands sized by max(in, out) at one shared scale; weighted-centre relaxation with collision resolution; `nodeWidth`, `nodePadding`, `iterations`, `align: 'left' | 'justify'`), `ribbonPoints` (S-curve ribbons stacked so they never cross at a node, entrance growing from the source), `renderSankey`, `hitSankey` (band, then ribbon via point-in-polygon), `<SankeyChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `sankeyToSvg` (server-safe).

- [#3368](https://github.com/pyreon/pyreon/pull/3368) [`74e9151`](https://github.com/pyreon/pyreon/commit/74e9151bd2ee24171e3239f0e187842521c0e582) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` grows the scale and mark vocabulary a production chart needs, in the engine so it crosses to iOS/Android:

  - **Log y scale** (`yScale="log"` / `<Scale y="log">` / `<Axis y scale="log">`): every left-axis mark lays out in the log view, the axis draws real decades (with 2×/5× minors under two decades), non-positive values are gaps, bars grow from the axis floor; tooltip, table and value labels keep the real values.
  - **Time y axis** (`yTime` / `<Scale y="time">`), the twin of `xTime`.
  - **100% stacked bars** (`stackNormalize` / `<Scale normalize>`): each column drawn as shares over a `{0, 1}` domain labelled as percent; raw values stay on every read surface.
  - **Waterfall** (`waterfall(y, { negativeColor })` / `<Bar waterfall>`): floating steps from running total to running total with dashed connectors, an entrance from each step's start level, hits by row.
  - **Error bars** (`errorLow` / `errorHigh` accessors on `bars`, `line`, `area`, `points` and their grammar twins): capped whiskers through each datum, the bounds joining the domain.
  - **Histogram** (`histogram(rows, x, { bins })` spread into `<PlotChart>`, or `<Histogram x bins>` in `<Plot>`) over the crossing `binValues` (nice-step edges, clamped extremes).
  - **Axis titles** (`xTitle` / `yTitle` / `y2Title`, `<Axis title>`), each in its own gutter line, the y titles rotated along their axes.
  - **Axis label thinning and rotation** (`xLabels`: `auto` slants overflowing category labels 45° and thins numeric ones; `rotate` / `thin` / `all` force one); the horizontal frame thins its category rows. The draw list's text command carries `rotate`, executed by the web canvas, the SVG serializer and both native canvases.
  - **Locale** (`locale="de-DE"` on `<PlotChart>` / `<Plot>`): numbers and, under a time axis, dates format through `Intl` on every surface; an explicit `format` wins. Web only (Intl), named on native.
  - **Facets** (`<Plot facet="region" facetColumns>`): small multiples in a grid, one titled panel per value, every panel sharing the y domain; a new value adds a panel, persisting values keep their panel.

  Native: the spec switches (`yScale`, `yTime`, `stackNormalize`, the titles, `xLabels`) lower as literals on both targets through the generated engine, `<Scale>` / `<Axis title labels scale time>` desugar, the waterfall mark lowers, and error bars lower as a second per-row accessor pair (the bubble radius channel's shape); `<Histogram>`, `locale` and `facet` are named as web-only rather than dropped. The engine regenerates with `bin.ts` and compiles on the real toolchains.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Series symbols: `points(y, { symbol })` draws every datum as a rect / circle / diamond / triangle, and `line(y, { symbol })` draws a symbol at every datum over the line.

- [#3315](https://github.com/pyreon/pyreon/pull/3315) [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Every `@pyreon/charts/plot` host gets the interaction stack.** Seventeen hosts now share one canvas host (`canvas-host.tsx`): `showTitle` / `subtitle`, `showLegend`, `tooltip`, `animate` (an entrance tween honouring `prefers-reduced-motion`), the resize observer, the accessible table and the theme resolution are one implementation instead of seventeen copies — and Treemap, Sunburst, Tree, Sankey, Graph, River, Polar, Gantt, Calendar, Parallel, Map, Funnel, Pie, Radar, Boxplot, Heatmap and Candlestick all draw a title, a legend (where the family has named entries) and a pointer tooltip for the first time. Selection is uniform: every host carries `onSelectIndex` (the engine's index — what the native tap reports) beside its rich `onSelect`; `<RadarChart>` gains a hit test (`hitRadarIndex` → `{ series, axis }`) and so its first `onSelect`.

  Bars are rounded by default: `theme.radius` (3) rounds the corners AWAY from the baseline on plain bars (top for positive, bottom for negative, right/left when horizontal); a mark's own `borderRadius` still wins; `radius: 0` restores square bars. Stacked and grouped segments keep only their mark radii.

  `<PlotChart maxPoints>` thins the visible slice with LTTB on the first mark when it exceeds the cap (rows stay aligned across marks); hits, tooltips and selection report the GLOBAL index of the row actually drawn.

  `bun run --filter=@pyreon/charts bench:engine` measures layout + render throughput of the engine itself (bars/line/area/points at 1k–100k, treemap, sankey, LTTB), with a command-count correctness gate.

  Native: the compiler warns BY NAME for chrome props a target does not draw yet (`tooltip` / `animate` everywhere; `showTitle` / `showLegend` outside PlotChart / Pie / Radar) and for `maxPoints`, instead of dropping them silently; the rounded default crosses through the generated engine.

- [#3288](https://github.com/pyreon/pyreon/pull/3288) [`fea7fde`](https://github.com/pyreon/pyreon/commit/fea7fdea10cc31972eb08a9f3cfd8d8a012d1a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Single-axis coordinate: `layoutSingleAxis` (one horizontal category or value axis with nice ticks, points placed along it and sized by a second dimension), `renderSingleAxis`, `hitSingleAxis`, `singleAxisToSvg` (server-safe).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The shared canvas host gains a `frame` prop: a family chart (pie, gauge, sunburst, chord, funnel, treemap, tree, sankey) draws inside that rect of the whole chart instead of filling the box, so a title and legend can draw over it.

- [#3289](https://github.com/pyreon/pyreon/pull/3289) [`6ea2c9c`](https://github.com/pyreon/pyreon/commit/6ea2c9c703f8154be52875e50a6e6e7ec1cfd917) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `sonifyValues(values, options)` — a series as sound: values map linearly to pitch (`minHz..maxHz`), an oscillator steps through them over `duration`, gaps play as silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair along with the audio. Injectable `AudioContext`; `play()` resolves when done or on `stop()`.

- [#3757](https://github.com/pyreon/pyreon/pull/3757) [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Family charts ship their first frame from the server too. With `@pyreon/charts/svg` imported on the server, `<PieChart>`, `<TreemapChart>`, `<SankeyChart>`, `<FunnelChart>`, `<RadarChart>`, `<HeatmapChart>` and every other canvas-hosted family now render their chart as SVG in the SSR / SSG HTML — the same draw list the canvas paints at its final state, title, legend, right-to-left mirror and transpose included — so the page shows the chart before any script runs. Hydration adopts the frame and the first canvas paint removes it. A family chart now always renders inside its positioned wrapper (the frame placeholder has to be in the client tree for hydration to match), including with `accessibleTable={false}`.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server-rendered charts can show the chart before any script runs. With `@pyreon/charts/svg` imported in the server entry (`import '@pyreon/charts/svg'`), every `<Chart>` / `<PlotChart>` ships its first frame as SVG in the SSR or SSG HTML. Hydration adopts it, and the first canvas paint replaces it. It is opt-in through that import because the serializer is about 2 KB gzipped that no browser bundle needs; `<Chart>` itself carries only a ~0.2 KB slot. A chart without a `width` draws its server frame at 600px and scales it to the container.

  `@pyreon/charts/svg` is now listed under `sideEffects`, so a bare `import '@pyreon/charts/svg'` is not tree-shaken away.

- [#3219](https://github.com/pyreon/pyreon/pull/3219) [`5346f90`](https://github.com/pyreon/pyreon/commit/5346f9015c57ee808a60556b76626d0a03636765) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Sunburst family: `layoutSunburst` (radial partition — one ring per depth, sibling spans proportional to value inside the parent's span, `padAngle`, `maxDepth`, `sort: 'desc' | 'none'`, `startAngle`, stable child-index paths, inherited colours tinted per ring), `renderSunburst` (arc bands via the shared polygon tessellation, labels only where the chord fits, clockwise entrance sweep), `hitSunburst` (deepest arc, hole-aware, wraps past 12 o'clock), `<SunburstChart>` (reactive canvas host, `innerRatio`, `onSelect(arc)`, accessible leaf table), `sunburstToSvg` (server-safe).

- [#3401](https://github.com/pyreon/pyreon/pull/3401) [`c19fb0d`](https://github.com/pyreon/pyreon/commit/c19fb0d9ca1b5457ecefd9e4d99473214468dfec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The static SVG helpers and the canvas hosts now read the same theme

  `gaugeToSvg` drew its value arc `#0f766e`, its track `rgba(132,150,165,0.22)`
  and its value text `#10161d`, while `<GaugeChart>` — same props, same default
  theme — drew `theme.palette[0]` (`#4f7df3`), `theme.grid` and `theme.text`.
  Three of three colours differed, so the SSR/static export of a chart did not
  match the chart the browser drew. `radarToSvg` had the same shape on its rings.

  Fifteen of the seventeen `*ToSvg` helpers also took no `theme` at all, and
  eleven families defaulted their own label / grid / axis colours to fixed
  light-mode literals on BOTH paths — `[#334155](https://github.com/pyreon/pyreon/issues/334155)` labels on a dark ground is
  roughly 1.4:1 contrast, i.e. invisible.

  Every helper now takes `theme`, and every family that draws chrome defaults
  its colours from it on both the canvas host and the SVG twin; a per-family
  option still wins. Labels drawn ON a coloured block (treemap, sunburst, river,
  funnel, pie) keep their fixed white — that is a legibility choice, not a theme
  value. Font sizes stay per-family: colour follows the theme, layout does not.

  The native emitters get the same merge, generalised from `palette` alone to
  the named theme fields, so a Compose/SwiftUI chart follows the system colour
  scheme where it previously did not.

  Graph and tree edges are themed too, and that one is a contrast bug rather than
  a parity bug: `linkColor` defaulted to a hardcoded `#94a3b8` that no host ever
  overrode, so both paths agreed and both were wrong on light. It reads 6.93:1 on
  the dark ground and **2.56:1 on white** — under WCAG 1.4.11's 3:1 for non-text
  contrast, on the DEFAULT theme. The value was clearly chosen for dark: it is
  dark's own `label` (`#9aa5b5`) to within (6, 2, -3). So it now reads `label`,
  dark is visually unchanged, and only light actually moves. A graph without
  visible edges is a scatter plot, so this is the family's meaning, not its
  chrome — which is also why it reads `label` (5.50:1 / 7.12:1) rather than
  `axis`, whose 3.05:1 / 3.14:1 clears the bar only barely.

- [#3288](https://github.com/pyreon/pyreon/pull/3288) [`fea7fde`](https://github.com/pyreon/pyreon/commit/fea7fdea10cc31972eb08a9f3cfd8d8a012d1a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Locale packs: `registerLocale` / `getLocale` / `numberFormatter` / `dateFormatter` over Intl, with optional packs (number options, date options, month names), applied to value-axis and time-axis labels unless the chart carries its own formatter.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<ChartThemeProvider>` takes `light` and `dark` overrides that apply only in their mode, over the shared `theme`:

  ```tsx
  <ChartThemeProvider theme={{ palette: palettes.okabeIto }} dark={{ background: '#0b1020' }}>
  ```

  The mode is the colour mode in scope — `<PyreonUI mode>`, `<ColorModeProvider>`, else the page's scheme — so `light` or `dark` picks correctly with no wiring. Both are plain data, so they lower on iOS and Android through the provider's compile-time scope, where a mode-branching `theme` accessor cannot.

- [#3287](https://github.com/pyreon/pyreon/pull/3287) [`05f4b35`](https://github.com/pyreon/pyreon/commit/05f4b352ef34afed00ed218a7692cab1066e5af9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Theme-river family (streamgraph): `layoutRiver` (layers stacked without gaps on a symmetric `silhouette` baseline or a `zero` baseline, missing values as 0, widest-point label anchors, category ticks), `smoothPoints` (Catmull–Rom sampling) + `layerPolygon`, `renderRiver` (layers back to front, axis, labels only where the layer is thick enough, left-to-right entrance), `hitRiver` (front-most layer under the point), `<RiverChart>` (reactive canvas host, `onSelect(layer)`, accessible table), `riverToSvg` (server-safe).

- [#3407](https://github.com/pyreon/pyreon/pull/3407) [`52b0b60`](https://github.com/pyreon/pyreon/commit/52b0b60e4a7739b8811aeaa75425326e59630ae6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart theme swapped its palette and nothing else

  **The theme gains semantic and ramp slots, because `linkColor` was not the
  whole class.** A sweep of every `options?.X ?? '<literal>'` colour default in
  the engine, cross-checked against what the hosts actually feed, found seven
  that no host feeds at all — so the constant always shipped:

  |                                                               | on `#ffffff` | on `[#141821](https://github.com/pyreon/pyreon/issues/141821)` |
  | ------------------------------------------------------------- | -----------: | -------------------------------------------------------------: |
  | `calendar.emptyColor` / `geo.emptyColor` `#e2e8f0`            |       1.23:1 |                                                    **14.41:1** |
  | `candlestick.downColor` / `parallel.highlightColor` `#b42318` |       6.57:1 |                                                     **2.70:1** |
  | `candlestick.upColor` `#15803d`                               |       5.02:1 |                                                         3.54:1 |
  | `gantt.todayColor` `#dc2626`                                  |       4.83:1 |                                                         3.68:1 |

  Plus `HEAT_RAMP`, a module constant shared by heatmap, calendar and geo.

  Measured on a real dark render, this is worse than low contrast — the chart
  **inverts**. A dark calendar drew 40 empty cells at 14.41:1 and its
  highest-value cell at 2.04:1, because a light→dark blue ramp loses contrast as
  the value rises on a dark ground. Absence of data was the loudest mark on it.

  So `ChartTheme` gains `positive`, `negative`, `muted` and `ramp`, both themes
  get values, and the host sites feed them. `muted` cannot be one value for both
  grounds: its job is to recede into `background`, which is definitionally
  theme-relative.

  Light is deliberately unchanged, with **one** exception worth naming rather
  than burying. The new light values ARE the old constants, so no draw-list
  golden moves — except gantt's today rule, which was `#dc2626` and is now
  `negative` (`#b42318`, the down-candle red). Two near-identical reds collapsing
  into one semantic token is the point of having the token, and the survivor is
  the better of the two on white (6.57:1 vs 4.83:1); but it IS a visible change
  on the light theme, and no golden renders a today rule, so nothing would have
  told you.

  Two native bugs fell out, both found by reading the emit rather than trusting a
  green suite. `chartThemeFields`' list branch read `palette` unconditionally —
  right while palette was the only list field, so a native calendar emitted the
  ten-hue categorical palette as its four-stop value ramp. And its override loop
  `continue`d on every list field, so `theme={{ ramp: [...] }}` was dropped in
  silence; a literal now lowers and a non-literal warns by name.

  The locks are invariants rather than values: a ramp must RISE in contrast
  against its own ground (the shipped one fell, 16.32:1 → 2.04:1), `positive` and
  `negative` must clear 3:1 there, and `muted` must stay under 1.5:1 while
  remaining tellable from the ramp's floor. That last one failed on the first
  draft of the dark values — `muted` and `ramp[0]` were 1.03:1 apart, so "no
  data" and "zero" were indistinguishable — which is the test catching the
  values, not the values passing the test.

  The heatmap needed its own fix, because a FRAME host does not take its ramp
  through `themeDefaults` — the emitters build that argument themselves, and both
  hardwired `HEAT_RAMP_DEFAULT` there. So the inversion was still live on device
  after the web half was fixed. Both now emit `pyreonTheme.ramp`, reading the
  theme the emit already resolved one line above, which picks up a `theme` prop,
  a `<ChartThemeProvider>` scope and the device's colour scheme at once. An
  explicit `colors` prop still wins.

- [#3315](https://github.com/pyreon/pyreon/pull/3315) [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`@pyreon/charts/plot` gets one theme.** `ChartTheme` is now a token map — `palette`, `background`, `surface`, `text`, `label`, `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius`, `enterMs`, `updateMs` — and every host, family, legend, title and tooltip reads from it. Series colours come from `theme.palette` (the nine private copies of one hex list are gone), so "change the series colours" is finally a theme. `chartThemes.light` / `chartThemes.dark` ship built in, `palettes` exports the named sets (`pyreon`, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`, `tableau10`, `okabeIto`, `tailwind`), and the new default palette is Pyreon's own. `<ChartThemeProvider theme>` provides a theme to every chart below it, in the colour mode in scope (`<PyreonUI mode>`, `<ColorModeProvider>`, else the page's scheme and the OS). Breaking: `ChartTheme` gained required fields — a hand-built full `ChartTheme` needs them (a `Partial` on the `theme` prop is unchanged).

  Also on `/plot`: `<BoxplotChart>` + `fiveNumber` and the `sma` / `ema` / `bollinger` / `trend` indicator marks were built and tested but never exported — they are now.

  Native: the theme struct crosses with every field, `theme={{ palette: [...] }}` colours a plot's marks on iOS/Android, and `palette.ts` joins the generated engine.

  PMTC lowers `readonly T[]` / `ReadonlyArray<T>` exactly like `T[]` (the theme palettes are `readonly string[]` end to end, so an `as const` palette typechecks as a theme override); `keyof` / `unique` types warn by name.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Toolbox on `PlotChart` (ECharts' `toolbox`): `saveAsImage` exports the current frame as an SVG through the engine's own serializer (download, or `onSaveImage(svg)` for custom handling), `restore` resets zoom, brush, legend toggles, legend page and any magicType override, and `magicType: ['line', 'bar']` retypes the independent marks (stacked/grouped/points keep their geometry). `toolbox.ts` is a pure layout (`renderToolbox`/`hitToolbox`/`toolboxTools`) with the legend's hit-rect contract.

- [#3555](https://github.com/pyreon/pyreon/pull/3555) [`d3fa2c6`](https://github.com/pyreon/pyreon/commit/d3fa2c6275d6648a8aff13c6638cf203c6694db9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The shared canvas host gains `enterDuration`, `enterDelay`, `updateDelay`, `enterEasing` and `updateEasing`, with ECharts' easing table (an entrance of 1000 ms `cubicOut` and an update of 300 ms `cubicInOut` read as ECharts' defaults).

  Fixed on the way: a redraw whose content equalled a running tween's target cancelled the tween.

- [#3219](https://github.com/pyreon/pyreon/pull/3219) [`5346f90`](https://github.com/pyreon/pyreon/commit/5346f9015c57ee808a60556b76626d0a03636765) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Tree family: `layoutTree` (tidy node-link layout — every leaf takes one slot, parents centre over their leaves; `orient: 'LR' | 'RL' | 'TB' | 'BT' | 'radial'`, `maxDepth`, a label gutter, stable child-index paths, inherited colours), `linkPoints` (smooth S-curves, orthogonal elbows, straight radial spokes), `renderTree` (links → symbols → outward leaf labels / inward inner labels, root-first entrance), `hitTree` (nearest symbol within a halo), `<TreeChart>` (reactive canvas host, `onSelect(node)`, accessible table), `treeToSvg` (server-safe).

- [#3219](https://github.com/pyreon/pyreon/pull/3219) [`5346f90`](https://github.com/pyreon/pyreon/commit/5346f9015c57ee808a60556b76626d0a03636765) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Treemap family: `layoutTreemap` (squarified layout of a value hierarchy — Bruls/Huizing/van Wijk rows, padded nesting, `maxDepth`, stable child-index paths, inherited colours tinted per depth), `renderTreemap` (fills per depth, leaf labels only where they fit, entrance scaling), `hitTreemap` (deepest cell), `<TreemapChart>` (reactive canvas host, `onSelect(cell)`, accessible leaf table), `treemapToSvg` (server-safe).

- [#3371](https://github.com/pyreon/pyreon/pull/3371) [`2b8533b`](https://github.com/pyreon/pyreon/commit/2b8533b8cf2aeff2c5814e85d98454a16389dc60) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The verification batch of the charts audit — the hosts are now MEASURED where they run, and the gaps that measuring found are closed:

  - **Browser coverage is a gate.** The node config excludes 21 host files as "fully exercised in real Chromium"; that promise was never measured. `vitest.browser.config.ts` now collects v8 coverage over exactly those files with thresholds set from the measurement (89.8% statements / 75.6% branches / 96.9% functions / 94.0% lines) that ratchet up. Measuring found hosts at 50–65% — each family spec proved its own geometry, nobody drove the shared paths on every host.
  - **A host sweep in real Chromium** (`host-sweep.browser.test.tsx`) drives all 20 hosts through the same paths: paint + chrome, the accessible surface (`role`, the table, `aria-describedby`), tooltip hit / miss / leave, click select through `onSelect` AND `onSelectIndex`, keyboard focus / walk / Home / End / Enter / Escape / blur with the live region, and PNG export. It found and this release fixes: no keyboard pick on `<RiverChart>`, `<HeatmapChart>`, `<PolarChart>` and `<RadarChart>` (Enter did nothing); and `<PlotChart>` lacking the `onSelectIndex` twin.
  - **Draw-list goldens** (`goldens.test.ts`, 22 families): the SVG for a fixed dataset per family, committed and compared byte-for-byte. Deterministic across platforms, unlike pixel baselines, and a diff names the command that moved.
  - **A real-app interaction leg** in the app-showcase e2e: hover, click and keyboard on the plot-engine chart under the shipped compiler. It found two things synthetic events cannot see — the chart REMOUNTED on every query settle (it was rendered inside a conditional accessor over `query.data()`, so a real pointer's tooltip was torn down mid-move; now `<Show>` + a reactive `data` accessor, bisect-verified in both directions) and a real pointer only reaches what is on screen.
  - **A comparison arm in the engine bench**: spec → SVG string, the engine's `renderSvg(renderChart(…))` against ECharts' SSR renderer, same rows and size. Measured 2026-09-08 (Bun, macOS, K=15): bars n=1000 1.40 ms vs 6.89 ms, bars n=10000 13.4 ms vs 59.0 ms, line n=10000 6.10 ms vs 11.6 ms. ECharts renders more chrome by default, so the number is that surface and nothing finer.
  - Dead code removed: `radial-host.ts` (superseded by the shared host, referenced by nothing).

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<SankeyChart>`, `<CalendarChart>` and `<ParallelChart>` take `orient="vertical"`: the horizontal layout reflected across the diagonal, on web, iOS and Android. `transposeCmds` / `transposeRect` / `transposePoint` join the engine's RTL mirror as pure draw-list transforms.

- [#3287](https://github.com/pyreon/pyreon/pull/3287) [`05f4b35`](https://github.com/pyreon/pyreon/commit/05f4b352ef34afed00ed218a7692cab1066e5af9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - visualMap component: `visualMap({ domain, … })` builds the strip's spec (`type: 'continuous' | 'piecewise'` with explicit `pieces` or `splitNumber`, colour `stops`, `orient`, end `text`, item size and length), `renderVisualMap` draws it (a 24-stripe ramp strip with end labels, or swatches + labels, vertical or horizontal, reporting its size), and `domainFromSeries` derives a domain from the data.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's `ChartSpec` gains an optional `drawOrder` (ECharts' `zlevel` / `z`): a series with a higher order paints over a lower one, while the legend, palette and hit test keep series order. The native engine is regenerated to paint by it.

- [#3411](https://github.com/pyreon/pyreon/pull/3411) [`1289bf1`](https://github.com/pyreon/pyreon/commit/1289bf16d01ec37098dba0971d71fe1680415cc1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The geo layout is a crossable shape: normalised rings, and a transform instead of a closure

  `<MapChart>` is the last chart family with no native lowering, and the reason
  was never charts — it was two shapes PMTC cannot carry. Both measured against
  real `swiftc` and `kotlinc` rather than inferred from types:

  - **GeoJSON's `geometry` is a `Polygon | MultiPolygon` union** whose
    `coordinates` are `number[][][]` and `number[][][][]` — one field at two
    array depths. The fat-struct lowering correctly bails by name rather than
    merging to `Any`.
  - **`GeoLayout.project` was a closure field.** A generated struct is `Codable`,
    and a function field is not.

  Both are gone. `geoShapes(geo)` reduces GeoJSON to `GeoShape { name, rings }`
  in projection space — the only place the union or the untyped `properties` bag
  is touched — and `layoutGeoShapes(shapes, box, options)` does the fit. The
  closure becomes `GeoTransform` data plus a free `geoProject(t, lon, lat)`,
  which is the same arithmetic the closure did.

  `GeoShape[] -> GeoLayout` now compiles on both targets.

  **Breaking**: `GeoLayout.project(lon, lat)` is replaced by
  `geoProject(layout.transform, lon, lat)`. Pre-1.0, and a shim would defeat the
  point — the whole change is that the layout is DATA. `layoutGeo(geo, box)`
  still takes GeoJSON and composes the two halves, so callers that only lay out
  and render are unaffected.

  This is the first of three steps toward `<MapChart>` on iOS and Android; the
  remaining two are splitting the GeoJSON half out of the crossing module, and
  the native host — which still needs a decision about how map data reaches the
  device, since `map="world"` resolves through a runtime registry that a
  compile-time bake cannot see.

- [#3413](https://github.com/pyreon/pyreon/pull/3413) [`4e8a34d`](https://github.com/pyreon/pyreon/commit/4e8a34d62a644b7449f62ff853853a96812b2170) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The geo geometry crosses into the native engine

  `geo.ts` is now the crossing half and `geo-web.ts` the web half, matching
  `calendar.ts` / `calendar-web.ts` and for the same reasons. `geo-web.ts` keeps
  exactly what cannot cross: GeoJSON's `Polygon | MultiPolygon` union (one field
  at two array depths), the untyped `properties` bag, the runtime name registry,
  and the record→list adapter.

  Adding it to `ENGINE_FILES` was the verification, and it took eleven distinct
  subset violations to get both toolchains compiling. They arrived in three
  tiers, and no single gate found more than one tier:

  **The generator** (it refuses any emit carrying warnings) caught a tuple return
  (`geoDomain` → the `Domain` struct the engine already had), three ring walks
  written `for (let i = 0, j = n - 1; i < n; j = i++)` — only the canonical count
  loop lowers, so `ringArea`, `ringCentroid` and `pointInRing` would all have
  generated as silently gutted functions — a spread inside a draw command
  (`points: [...ring, ring[0]!]` reads as mixed element types and dropped the
  whole polyline literal), and a `Record<string, Double>` parameter.

  **swiftc / kotlinc** caught four the generator emitted CLEANLY: `NaN` and
  `Infinity` are JS globals with no lowering that emit verbatim and produce
  `cannot find 'NaN' in scope`; `colorRamp` is the web closure factory where the
  crossing form is `rampColor(stops, t)`; `measureApprox()` likewise, where the
  crossing default is `approxTextWidth`; two `T | null` locals have no contextual
  type on either target; and a chained `a.y > py !== b.y > py` is a Swift parse
  error, since `>` and `!==` share a non-associative precedence group.

  **The native suite** caught the last, which compiled fine in isolation and only
  broke OTHER families: `GeoValue { name, value }` is structurally a subset of
  `TreeNode`, so a treemap literal started resolving to it. The field is `region`
  now — distinct, and the better name.

  Every fix came from a convention the engine already states: `heat.ts`'s header
  names `rampColor` as the crossing form, `river.ts` and `treemap.ts` both say
  "no Infinity sentinels", `gantt.ts` shows the measurer default, and
  `indicator-values.ts` spells a gap `0.0 / 0.0`.

  **Breaking**: `geoDomain` returns `Domain` rather than a tuple,
  `GeoOptions.domain` takes one, and `renderGeo`/`geoDomain` take `GeoValue[]`
  (`geoValues(record)` converts). Callers that lay out and render through
  `layoutGeo` / `geoToSvg` / `<MapChart>` are unaffected; the surface exported
  from `@pyreon/charts/plot` is the same symbols, now from two modules.

  Engine: 296,834 → 308,306 bytes of generated Swift.

- [#3414](https://github.com/pyreon/pyreon/pull/3414) [`ae94355`](https://github.com/pyreon/pyreon/commit/ae94355b40dc371a558c7d923eee646c20148a62) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<MapChart>` lowers to iOS and Android from a precomputed `GeoShape[]`

  `<MapChart>` was the last `@pyreon/charts/plot` host with no native lowering,
  and the recorded reason was a data shape rather than the geometry: GeoJSON's
  `geometry` is a `Polygon | MultiPolygon` union whose `coordinates` are
  `number[][][]` and `number[][][][]` — one field at two array depths, which the
  native struct lowering correctly refuses to merge.

  `map` now takes a third shape, `GeoShape[]`, which is that union already
  normalised to rings — and that shape crosses. A `<MapChart map={SHAPES}
values={{ A: 5 }}>` emits `layoutGeoShapes` / `renderGeo` / `hitGeoIndex` /
  `geoTip` over the generated engine on both targets, with the tap, the tooltip
  and the theme defaults every other family host already had. An inline `values`
  record becomes the crossing `[GeoValue]` at compile time (the shape
  `<CalendarChart values>` already used); a `GeoValue[]` passes through.

  The two web-only `map` shapes — a `registerMap` name and a raw
  FeatureCollection — now refuse BY NAME and say which shape does cross, instead
  of the host declining wholesale. `geoShapes(json)` itself reads GeoJSON, so
  shared multiplatform source passes a precomputed const and projects on the web
  or in a build step.

  Also fixed, and visible on the web too: a geo border defaults from the page
  GROUND, and `background: ''` ("inherit the page") is the one theme field a
  chart cannot paint with. The native emit resolved it to an empty colour;
  `ChartThemeText` now carries a derived `pageGround` that resolves it to white,
  so a native map's borders read `#ffffff` on light and `[#141821](https://github.com/pyreon/pyreon/issues/141821)` on dark —
  the same values the web host computes.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Render native-safe geographic paths and point marks through `MapChart` on web, iOS, and Android.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add cross-platform point-index selection for geographic overlays.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle native-safe geographic point and path overlay geometry into the generated Swift and Kotlin chart runtimes.

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine gains a `frame` module that resolves a chart's placement (`center`, `radius` and the box keys) at the device's own size; the web uses the same function, so the two targets place a chart identically. `renderDial` takes an optional palette, and the new `renderDialIn`, `pieHitWith` and `pieTipWith` are shared by web and native.

- [#3448](https://github.com/pyreon/pyreon/pull/3448) [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart selectedMode onSelectChange>` now lowers to iOS and Android: a tap
  pins a datum, the engine draws the pinned outline from `ChartSpec.emphasis`, and
  the change reports with global indices.

  The pin logic moved out of `<Chart>`'s `pickDatum` into `pinSelection`, a
  crossing helper beside `legendToggle`, and the web calls it too — so the three
  targets cannot come to disagree about what a second tap does.

  `emphasis` and `onHighlight` stay web-only, and their reasons are corrected:
  both are hover-driven (`mouseover`/`mouseout`), which a touch target has no
  analogue for. The old text said they were "waiting on host state", which read as
  unbuilt work. The state exists now, and they still do not lower — because a tap
  is a pick, not a hover.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - One light/dark mode for the whole framework. `useColorMode()` in `@pyreon/core` returns the mode in scope: the nearest `<ColorModeProvider mode>` or `provideColorMode(mode)`, else the page's declared `color-scheme`, else `prefers-color-scheme` (light on the server). `mode` is `'light'`, `'dark'` or `'system'`, or an accessor. `systemColorMode()` is the page-and-OS half alone.

  `<PyreonUI mode>` now provides it, so everything below a PyreonUI follows the UI system's mode with no extra wiring.

  **Breaking, `@pyreon/charts`:** charts read the shared mode, so a chart below a dark `<PyreonUI>` is dark. `<ChartThemeProvider>` no longer takes `mode`: set it with `<PyreonUI mode>` or `<ColorModeProvider mode>`. `systemChartMode()` is now `systemColorMode()` in `@pyreon/core`. The provider hands down a theme per mode, so a mode set below a provider still picks that provider's `light` / `dark` override. `pyreon doctor diagnose` explains both upgrade errors.

  **Native:** a literal `<ColorModeProvider mode>` or `<PyreonUI mode>` is a compile-time scope the charts below inherit, and it re-resolves an outer provider's per-mode overrides. `'system'` keeps the platform scheme. A reactive mode on `<ColorModeProvider>` warns by name; on `<PyreonUI>` it is silent, as it was before. In both cases the charts below follow the platform scheme instead of being pinned to light.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a typed single-axis canvas host and lower static option-format calendar heatmap, parallel-coordinate, river, polar, and boxplot charts through their native engines on SwiftUI and Compose, preserving calendar range and visual settings, values, axes, categories, domains, line styles, grouped streams, multiple polar series, and five-number summaries.

- [#3774](https://github.com/pyreon/pyreon/pull/3774) [`cdb8a24`](https://github.com/pyreon/pyreon/commit/cdb8a24d46e2c9b8e1ee0813df8ff6410647fb69) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Keep band regions paired across missing bounds on canvas, SVG and native. Resolve both band boundaries once per frame to avoid repeated full-channel scans, and preserve infinite-value gaps during keyed updates of transformed marks.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Render horizontal and vertical option mark areas with labels and colours through the shared web, SwiftUI, and Compose draw-list engine.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The accessible data table a chart renders for screen readers now builds its
  rows into 50-row `<tbody>` blocks instead of one. On a 1,000-point line chart
  that cut first render from 12.5 ms to 10.4 ms in a back-to-back run. Every row
  stays in the accessibility tree; a browser spec reads Chromium's tree to hold
  that.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The area brush (ECharts' `brush` model) works on web and native.

  - `PlotChart` takes `brushType` (rect, polygon, lineX, lineY), `brushMode`, `outOfBrushOpacity`, `brushSeriesIndex` and `onBrushSelected`. Datums outside the brush fade, and the callback reports the brushed data indices per series.
  - `toolbox.brush` adds the rect / polygon / lineX / lineY / keep / clear tools.
  - iOS and Android lower all of it onto the chart host. The selection geometry is one shared engine module.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis `offset` maps on web and native: the x axis and both y axes move off the plot edge by their offset, with their labels, and the gutter grows by the same amount so nothing clips. Native spec literals now accept numbers.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis `position` maps on web and native: `xAxis.position: 'top'` draws the x axis above the plot, a lone `yAxis.position: 'right'` draws the value axis on the right, and two y axes whose first is placed right swap sides with `yAxisIndex` following. Two y axes placed on the same side warn by name.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Decals follow ECharts' model on web and native. A decal tiles its `symbol` (rect, circle, triangle, diamond, pin or arrow) on the `dashArrayX`/`dashArrayY` pitch, scaled by `symbolSize` and turned by `rotation`. Previously every decal collapsed to diagonal, cross or dots. `aria.decal.show` gives each series without a decal a distinct default texture. Pattern geometry now lives in one engine function (`patternMarks`) that the web canvas, SVG, SwiftUI and Compose painters all draw, so a texture cannot differ by target. `ChartPattern` gains `angle`, `symbol` and `spacingY`, and a `symbols` kind.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart handle's `dispatch` (ECharts' `dispatchAction`) is now one pure reducer, `applyChartAction`, and it runs on web, iOS and Android.

  - New actions: `takeGlobalCursor` (arm the area brush) and `brush` (set or clear its areas).
  - A dispatched `brush` fires `onBrushSelected`, as a drag does.
  - On native, `createChartHandle()` lowers to a `PyreonChartHandle`. A bound `PlotChart` reads and writes its fields, and `handle.dispatch({ ... })` with an inline action object lowers too.
  - Fixed: a `PlotChart` with `selectedMode` under a zoom window no longer fails to compile on native.

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs: manifest entries for `<GanttChart>`, `createChartLink` and `sonifyValues` (MCP `get_api`, llms), an Interaction section (dataZoom, navigator, zoom presets, keyboard, update animation, linked charts), Gantt and sonification sections on the charts docs page, and the README.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Chart engine hardening:

  - Small values no longer print as `0`: `plain` keeps about three significant digits below 0.01 and switches to exponent notation outside 1e-4…1e15, and tick labels carry the precision their step needs. A chart of 0.00012-scale data used to label every tick and tooltip `0`.
  - Numeric strings (`"42"`, the usual shape of CSV or form data) are coerced with a one-time dev warning instead of silently plotting as gaps, and an unknown mark kind warns.
  - Month, quarter and year time-axis ticks sit on calendar boundaries in UTC; they used to drift from a fixed-length step counted from the epoch.
  - `maxPoints` below 3 and a log axis over values ≤ 0 warn.
  - The canvas backing store is no longer reallocated on every draw when its size is unchanged, and a devicePixelRatio change redraws at the new density.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A third and later y axis (`yAxis[2]`, `yAxis[3]`, …) is now drawn on web and native, on its `position` side at its `offset`, with its own domain, tick labels and title. A series with `yAxisIndex: 2` or higher scales on it. A `yAxisIndex` that names no declared axis warns by name.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every series on a `geo` now draws. Previously only the first series rendered and the rest were silently dropped. `scatter`, `effectScatter` and `lines` combine. A `heatmap` on the geo draws soft radial blobs coloured by the visual map, a `pie` with `center: [lon, lat]` draws at that point, and a `map` series with `geoIndex` colours the geo's regions. `<MapChart>` gains `heat`, `heatRadius`, `heatStops` and `pies` on web and native. Anything else on a geo (a series off it, a pie without a centre, an unsupported type, a trail on geo lines) warns by name. `withAlpha` now applies alpha to `rgb(...)` colours; it used to return them fully opaque.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Geo lines animate an `effect` trail on web and native. `<MapChart trail>` (`period`, `trailLength`, `color`, `symbolSize`) runs it along `paths` on the same frame clock as cartesian lines: the web canvas host's clock, or `PyreonChartClock` on native. Under reduced motion the trail holds still.

- [#3601](https://github.com/pyreon/pyreon/pull/3601) [`f3816f2`](https://github.com/pyreon/pyreon/commit/f3816f278bcb43be8d4de6879778fa31dd2a4b76) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart>` (formerly `<Plot>`) no longer bundles the pie, funnel, heatmap and candlestick renderers when you don't use them. Each family mark (`<Arc>`, `<Stage>`, `<Cell>`, `<Candle>`) now carries its own host component, so importing `Chart` and `Line` costs 47.8 KB gzipped instead of 65.9 KB, 27% less. A pie through `<Arc>` no longer includes the other three families either. An import budget in CI locks this in.

- [#3159](https://github.com/pyreon/pyreon/pull/3159) [`f727234`](https://github.com/pyreon/pyreon/commit/f727234bd092283eda846271710a5dc68384fb93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Engine: hex color decoding (radar's `withAlpha`, heat's ramp channel reader) now uses `charCodeAt` arithmetic instead of String Int-subscripts and `parseInt` radix — byte-identical rgba/rgb output on web (full test suite green), and the shapes Swift rejects outright ("cannot subscript String with an Int") are gone from the native draw-pipeline bundle.

- [#3161](https://github.com/pyreon/pyreon/pull/3161) [`78de81b`](https://github.com/pyreon/pyreon/commit/78de81b21912f69aac06bd23825bcfd2fc104efb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hit-test stacked and grouped bars, size the radial charts to their container, escape `idPrefix`

  **`onSelect` was permanently dead for `stacked` and `grouped` bars.** The hit test bailed on `kind !== 'bars'` behind a comment excusing "a line/area chart" — but stacked and grouped _are_ bar marks that draw real rects, so every click reported `-1` while `onSelect`'s own JSDoc says it fires "with the datum index when a bar is tapped". The tooltip shared the same bail, so it never appeared over those charts either. `layoutStackedBars` / `layoutGroupedBars` were already public; they simply were not asked, because those series are laid out TOGETHER (each needs the others to place its bars) and so cannot be queried one series at a time the way `barsFor` does. `stackedHitAt` asks them as a set and returns the datum index, matching what a plain bar series reports.

  **`<PieChart>` and `<GaugeChart>` pinned themselves at mount width.** They read `el.clientWidth`, and `prepareCanvas` writes an inline `canvas.style.width` — so the first measurement is what every later read returns, and the chart stays that size forever. `<PlotChart>` measures the PARENT and observes it with a `ResizeObserver`, and its own comment documents this exact failure ("pinned at that fallback forever — 300px inside a 430px column, with nothing in the DOM looking wrong"); the radial family never got either half, while the documented example passes no `width`. The `?? 300` in that expression was dead code too — `clientWidth` is always a number. An explicit `width` still wins, and the observer is guarded against the feedback loop the draw itself causes.

  **`renderSvg`'s `idPrefix` was interpolated unescaped** into the root `<svg>`'s `id` and `aria-labelledby`, so a prefix of `a" onload="…` put a live handler on the element. It was the one interpolated option without `esc()` — eleven lines above `background`, which has it. The manifest tells callers to vary the prefix per chart, which is where a data-derived value comes from.

  Also restores `@pyreon/charts` to its declared 98% branch threshold. The package had been measuring 96.47%, which was invisible until the coverage gate began comparing every threshold a package declares rather than statements alone — at which point a pre-existing shortfall turned the gate red for every PR whose affected set reaches charts, which is any compiler change. The gap is closed with real assertions on what gets DRAWN (a reversed annotation band, a coloured rule, a rule with no label, a bubble whose radius array has a hole, an all-zero r channel, a malformed colour stop), not by lowering the number.

- [#3431](https://github.com/pyreon/pyreon/pull/3431) [`f29f70a`](https://github.com/pyreon/pyreon/commit/f29f70aa97c34dbd50ff7a20e8c7c3c93046ed8a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(charts): `paintCached` dropped the RTL mirror

  **`paintCached` dropped the RTL mirror.** `canvasHost` has two paint paths and
  only `draw()` applied the presentation transform. `paintCached` runs on every
  tick of the update tween, on each arrow key, on Escape and on blur — so an RTL
  chart un-mirrored on the first keypress, and a data change painted frame 0
  mirrored and every later frame unmirrored, SETTLING unmirrored while the pointer
  seam kept mirroring. `present` now lives above both paths and both go through it.

  The file is new this cycle, so the bug never shipped.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Image patterns and `path://` / `image://` decal symbols draw on web and native. An ECharts `color: { image, repeat }` fill (a URL, a data URI, an `<img>` or a `<canvas>`) tiles at its natural size with `repeat`, `repeat-x`, `repeat-y` or `no-repeat`; an `image://` decal tiles the image on the decal pitch; a `path://` decal draws its SVG path (`M L H V C Q Z`), fitted to the symbol size. The web canvas, SwiftUI and Compose load each image once and repaint when it arrives. A line stroke image is named, since only fills take patterns.

- [#3592](https://github.com/pyreon/pyreon/pull/3592) [`bd76a4a`](https://github.com/pyreon/pyreon/commit/bd76a4ac437a0b7c6dd5bc4495ef2a7573f3afe5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Moving the keyboard focus through a chart formats the one row it announces. It
  used to build the chart's whole data table, uncapped, on every arrow key, Home
  or End to read that row back out: on a 100,000-point line chart, 100,024
  formatted values per keystroke, now 25. The native chart engines are
  regenerated from the same table code; their behaviour is unchanged.

- [#3757](https://github.com/pyreon/pyreon/pull/3757) [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two gaps in the keyed `<Chart by>` morph are closed. On iOS and Android, value labels no longer jump to their new place while the bars slide: every value label of a keyed chart carries its row key, and the native tween hides keyed labels until it lands — what the web morph already did. And a line with gaps now morphs by key on every target: the engine keys each unbroken run with its own rows (and the series by its label), native matches a point across runs a gap opened or closed, and the web morph breaks the line at a gap instead of bridging it mid-animation. A curved line keeps the positional tween on native, where curves do not lower.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts: a 100,000-point line mounts ~9× faster in real Chromium (~320ms → ~36ms), measured head-to-head against ECharts 6 in `examples/benchmark` (`bun run bench:charts`). The layout measured every category label with `measureText`; it now samples them the way ECharts' `calculateCategoryInterval` does (every `floor(n/40)`-th label past 40). The label step is no longer capped at 200, which drew ~500 overlapping labels on a 100,000-category axis. The accessible table formats only the rows it shows (`chartTable` takes a `limit` and reports `total`) and updates its cells in place instead of remounting 1,000 rows per draw. The y extent is streamed instead of copied twice per resolve, and the accessibility input reuses the drawn layout instead of laying the chart out a second time.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ECharts `lines` series are now an engine feature, and their animated `effect` trail works. The head travels each line once per `period`, trailing `trailLength` of it in `effect.color`, driven by a frame clock in the web canvas host and in new `PyreonChartClock` native views. Under reduced motion the clock holds at 0 and the chart is still.

- [#3172](https://github.com/pyreon/pyreon/pull/3172) [`6599ad9`](https://github.com/pyreon/pyreon/commit/6599ad9b15b81f1044669f272e557f6164a4354a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `logTicks` walks its exponent range with a `while` loop instead of a compound-condition `for` head. Web behavior is byte-identical; the change keeps the function inside PMTC's canonical loop subset so the native-emitted engine retains the loop body instead of warn-dropping it.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A dense category line (straight segments, no gaps) is now reduced straight from its value array instead of creating one point per datum and then dropping almost all of them. The drawn points are bit-identical to before. At 1M points the engine's line render drops from about 470 ms to about 46 ms, most of which was garbage collection of the dropped points. iOS and Android use the same path.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Maps roam on web and native. `<MapChart roam>` pans on drag and zooms on the wheel or pinch, about the pointer, within `scaleLimit`. `roam: 'scale'` only zooms and `roam: 'move'` only pans. The view is part of the engine's `GeoOptions` (`zoom`, `panX`, `panY`), so regions, overlays and hit tests follow it. On native the gestures run the same `geoRoamPan` / `geoRoamZoom`.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Faster first paint for `<Chart>` / `<PlotChart>`, from a profile against uPlot and Chart.js:

  - Every row went through every mark accessor twice on mount: once for the frame, and again for the canvas's accessible description (26% of mount JS at 1M points, and it ran even with `accessibleTable={false}`). A chart over all its rows now resolves them once and both read the result.
  - An accessible table over 200 rows now fills right after the chart's first paint rather than before it. At 1k rows its layout was about 9 ms of a ~10.5 ms first frame. A screen reader reaches the table one frame later; smaller tables still fill at mount, and a server render still ships the table filled.
  - The same applies to data updates: a table over 200 rows is rewritten after the next paint, coalesced so a burst of updates writes only the latest data. It used to refill in the update's own frame (6.0 ms against 1.4 ms without the table on a 10k-point update).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<FunnelChart>`, `<PieChart>` and `<GaugeChart>` lower to native. The accessor-prop hosts map their rows through the accessor bodies INLINED into one closure (`rows.enumerated().map { (i, d) in FunnelStage(value: Double(d.total), label: d.name, color: …) }` / `mapIndexed`), with the shared palette for an absent `color`; a block-bodied accessor warns by name. `onSelect` (already an index on these hosts) and `onSelectIndex` lower to the tap over `hitFunnel` / `hitArc`. `<GaugeChart>` lowers with its fixed half-circle box and the value text; `<PieChart showLegend>` renders without the legend and says so. README: the native-geometry section lists them.

- [#3216](https://github.com/pyreon/pyreon/pull/3216) [`e669817`](https://github.com/pyreon/pyreon/commit/e6698175ffe21651057be52086b2706177e854d0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The candlestick and heatmap geometry join the generated native chart engine (`PyreonChartEngine.swift` / `.kt`): `ohlcExtent`, `renderCandles`, `buildHeatGrid`, `colorRamp`, `HEAT_RAMP` and `renderHeat` now lower with zero transform warnings and compile on both toolchains. Two engine-side idioms made it possible with no behavior change on web: `renderCandles` takes an OPTIONAL options object (an empty-object-literal default has no native lowering) and `buildHeatGrid` keys its aggregation map by an INDEX into the cells array (a Map with a struct value has no native lowering).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs: the README gains a "Native geometry" section stating that every `@pyreon/charts/plot` family is generated into `PyreonChartEngine.swift` / `.kt`, which API shapes exist because of the crossing (index hits, `{ min, max }` domains, ISO/day dates, `rampColor`, `calendarValues`, `parallelRows`, the seeded LCG), and what stays web-only (hosts, gestures, sonification, the tween); the manifest's multiplatform rationale says the same, and the derived web-only rationale in `@pyreon/compiler`'s native audit and `@pyreon/native-compiler`'s web-only warning carries the same text.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` family hosts lower to native. `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>` and `<PolarChart>` — the hosts whose props are plain data — now emit `PyreonChartCanvas` over the generated engine (`renderX(layoutX(...))` with the web host's own box arithmetic), sized by a `GeometryReader` / `BoxWithConstraints` or by `width` / `height`, with `title` as the accessibility label and `data-testid` as the identifier. The accessor-prop hosts (`PlotChart`, `PieChart`, `GaugeChart`, `RadarChart`, `FunnelChart`, `HeatmapChart`, `CandlestickChart`), `CalendarChart` (a record) and `ParallelChart` (mixed rows) warn BY NAME on native instead of naming a view that does not exist. Importing from `@pyreon/charts/plot` no longer raises the package's web-only warning. The Swift/Kotlin stub typecheck links the REAL generated engine when a chart host is present. `PyreonChartCanvas.kt` scales its draw list by the display density so the engine's units read as dp, matching CSS px on the web and points on iOS. README: the native-geometry section names the lowered hosts.

- [#3156](https://github.com/pyreon/pyreon/pull/3156) [`dd72331`](https://github.com/pyreon/pyreon/commit/dd7233126295c7faac03c170a9c90b04d14d92cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Engine: coalesce-first optional idioms — `spec.progress ?? 1.0`, `spec.xValues ?? []`, `s.curve ?? identity`, `resolveYDomain` via `?? deriveYDomain(spec)`, annotation guards binding coalesced values before their presence checks. Value-preserving on web (full suite green); these are the shapes Swift can compile, since it does not narrow optionals through ternaries or compound guards.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs: the multiplatform capability matrix gains a Charts (plot engine) row, and the web-only table no longer lists `@pyreon/charts` — the engine and its hosts render natively. The manifest's multiplatform rationale says the same.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `PlotChart`'s zoom gains `initialZoom` (the opening window) and `zoomLimits` (`zoomLock`, `minSpan`, `maxSpan`) on web and native, with the limits applied to every gesture by a new engine function.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A pictorialBar's `symbolClip`, `symbolMargin`, `symbolBoundingData`, `symbolOffset`, `symbolPosition` and `symbolRotate` warn by name instead of being accepted and silently ignored (`symbol`, `symbolRepeat` and `symbolSize` are the mapped keys).

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Presentation states — ECharts `emphasis`/`select`/`blur` — go further, on web and native.

  - A state's own stroke width (`lineStyle.width`) and area fill opacity (`areaStyle.opacity`) apply while that state is active.
  - `emphasis.scale` grows the highlighted point's radius (`true` reads as ECharts' own 1.1); `emphasis.disabled` stops a series from ever highlighting.
  - `emphasis.label` / `select.label` print the datum's label only in that state.
  - `selectedMode: 'series'` pins a whole series with one tap, on `PlotChart`, on web, iOS and Android — the bar/stacked/grouped outline and the line/area/point fill both honour it.
  - `emphasis.blurScope`'s three real values are accepted; an unknown one, `select.disabled`, `select.lineStyle`/`areaStyle`, `blur.label` and a state label's own styling are still named — a pinned datum has no line to stroke, and a blurred one keeps its own label.

  Found on the way:
  - `PlotChart` with `selectedMode` under a zoom window referenced rows a decimated chart never declares on native — fixed for the width-computed selection expressions too.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The README gains a measured browser performance section against uPlot, Chart.js and Recharts (first painted frame and full-data update, 1k to 1M points, plus 1k bars and minimal bundle size), re-measured after the mount-cost, table-update and M4-from-values fixes. It reports the losses as losses: the default `<PlotChart>` is still slower than uPlot on every line mount and than Chart.js from 100k points up. It states that a large accessible table is written after the measured frame on both mount and update, so that cost moved rather than disappeared. It also states that the 1M and 100k cells are JIT-tier sensitive.

- [#3390](https://github.com/pyreon/pyreon/pull/3390) [`fe4e196`](https://github.com/pyreon/pyreon/commit/fe4e1968d2ce95b17a576179bf6a3b6e3100b871) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pre-release fixes in `@pyreon/charts/plot`, sharing one theme — an input the types allowed reaching a path that never considered it.

  **RTL is a TWO-WAY seam, and only one direction was centralized.** `mirrorCmds` (chart → pixels) and `localX`/`localPoint` (screen → chart) were both in `./rtl`; the chart → SCREEN direction had no home, so both hosts wrote a chart-space x straight to the tooltip's `style.left` — a cursor at x=60 on a 400px `rtl` chart put the tooltip at `left:248px`, the mirror image of the pointer. Added `screenX` / `screenRectX` (a BOX mirrors by its far edge, so the point and rect forms differ), both exported from `@pyreon/charts/plot` so a custom host uses the same seam. The same gap in a second guise: `toolbox saveAsImage: 'svg'` serialized `lastFrame`, captured BEFORE the mirror — the SVG export was byte-identical in `rtl` and `ltr` while the PNG was mirrored.

  **A non-finite value is a GAP wherever a NaN was one.** Several entry points tested `v === v`, which is a NaN check written as a finiteness check: an `Infinity` reached the geometry. `makeTicks` emitted 1000 NaN ticks for a non-finite bound (now zero); `extent` returned a NaN domain from one bad sample; `fiveNumber` produced 242KB of NaN SVG from one `Infinity` while its own docblock said non-finite values are dropped. Closed at every entry point user data reaches without `marks.ts`' coercion — bars, grouped/stacked bars, waterfall, parallel coordinates, calendar, bin, boxplot, bubble, geo, heat, navigator, polar, river, the tooltip, the accessible table and `sonifyValues`. `isFiniteNumber` is the one predicate (written in the native subset — `Number.isFinite` has no lowering in the crossing engine) and is exported.

  **`sonifyValues` constructed an `AudioContext` per `play()` and never closed one.** Chrome caps live contexts at ~6 per document, so the seventh press threw `NotSupportedError`. One context is now owned per hook, created lazily and closed when the run settles or is stopped; a caller-supplied `options.context` is never closed.

  **`<For>` inside `<Plot>` rendered zero marks, silently.** The child walk handled function children, arrays, `<Show>` and fragments but not `<For>`, and an unrecognized child was `continue`d with no diagnostic. `<For each>` now resolves through its render callback like a `.map()` child, and anything that is not a mark warns in dev naming the tag.

  **A server-rendered `<canvas>` carried no size** — `prepareCanvas` only runs on the client, so every hydrated chart laid out at the HTML default (300x150) and jumped to its real box on the first paint. The width/height and CSS box are now emitted as attributes when known.

  Also: `DEFAULT_PALETTE` / `DARK_PALETTE` are `readonly string[]`; the `accessibleTable` JSDoc is reattached to its property; and `rtl.ts` cited a `mirror-parity.test.ts` that has never existed (the real one is `packages/native/compiler/src/tests/native-chart-mirror-parity.test.ts`).

  The crossing engine sources changed, so the generated native engine is regenerated (byte-identical drift lock, zero transform warnings).

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A second x axis whose `data` has the same number of categories as the first is drawn on web and native, as a second set of labels (and its `name` as a title) on the opposite edge. Series may name it with `xAxisIndex: 1`. Any other second x axis warns by name.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A server-rendered chart now carries its data. The hidden accessible table used to be built through the DOM on the client only, so SSR and SSG pages shipped an empty `<table>`: crawlers, no-JS readers and anyone before hydration got the chart's name and none of its numbers. The server now writes the caption, headers and rows as markup, hydration adopts them as they are, and the client keeps them up to date from there. This applies to every chart host.

  Also fixes a test that timed out under parallel load: it made about 150,000 separate assertions (~10s), and now checks the same invariant in about 100ms.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The `<Chart>` API reference now names a common surprise: `title` labels the chart for screen readers and the accessible table, and `showTitle` draws it above the chart.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart toolbox (ECharts' `toolbox` model) works on web and native.

  - `PlotChart toolbox` gains `magicType` stack / tiled, a box-select `dataZoom` with a back button, and a data view of the chart's table.
  - On iOS and Android, every tool lowers onto the chart host. `saveAsImage` opens the share sheet, or hands `onSaveImage` a PNG data URL, on the plot host and on the family charts (pie, heatmap, sankey, …).
  - A custom `myTool`, whose `onclick` is a function, and a y-axis box zoom are named in a warning, not silently dropped.

  Also fixed:
  - Two charts on one native screen with zoom state no longer declare the same SwiftUI state twice.
  - `describeChart` no longer indexes past an empty category list, which crashed Android on a chart without categories.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `PlotChart` takes `universalTransition`: a series or row-count change runs a command-level morph (the same `cmd-tween.ts` machinery the canvas host uses), so a shape change tweens instead of snapping. Native's runtime canvas is shape-agnostic and already emitted the flag.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A second value (or time) x axis maps on web and native: a series with `xAxisIndex: 1` is placed at its own x positions over that axis's domain, whose ticks and title sit on the opposite edge, and the accessible data table prints those positions.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The visualMap is interactive on web and native. A `calculable` continuous strip has two handles that drag the in-range interval, and a piecewise strip's swatches toggle their pieces. Values outside the selection take `inactiveColor` (`#ccc` by default). `range` and `selected` set the initial selection. The heatmap, calendar and map hosts draw the strip and own the gesture: `<HeatmapChart visualMap>`, `<CalendarChart visualMap>`, `<MapChart visualMap>` with `onVisualMapChange`, each built with the `visualMap({ domain })` builder. Native builds the strip at compile time and keeps the selection in host state. The strip geometry, hit tests and colouring rule are one engine module shared by every target.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `xAxis.inverse: true` runs the x axis right to left, on web and native. Category charts reverse every per-datum channel together, and hits still report the original datum index. A continuous x axis inverts through its domain.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `yAxis.inverse: true` draws the value axis upside down, on web and native. The engine's `Domain` gained an `inverse` flag honoured by the linear scale, so marks, ticks and hit-testing all invert together. Stacked bars and filled areas now build their geometry through the scale, so they invert too.

- [#3174](https://github.com/pyreon/pyreon/pull/3174) [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases,
  extending [#3174](https://github.com/pyreon/pyreon/issues/3174)'s sweep to every package.json the first pass hadn't reached
  (that pass touched only the root manifest, so nothing there tripped the
  Changeset gate — this one edits per-package manifests directly and does).

  Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
  0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
  — `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
  (`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
  `@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
  (`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
  5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
  companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
  agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
  pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
  auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
  v3 major this repo already adopted.

  Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
  `react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
  `typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

  `examples/benchmark`'s framework competitors were refreshed too so the
  "fastest framework" comparisons stay honest against current releases: Vue +
  `@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
  → 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
  0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
  production build before committing to it. Octane 0.2.2 replaces the
  `forBlock` fast-path flag the row-list bench's own doc comment describes
  un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
  reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
  0.2.2 and reading the emitted flags), so the comparison stays fair, but
  every previously-published Pyreon-vs-Octane number in
  `.agents/guides/benchmarks/README.md` was measured against 0.1.46 and
  needs re-verification against 0.2.2 before being cited again — flagged
  there, not restated as fact here.

  Held deliberately, each for a stated reason found by actually reading the
  dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
  the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
  built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
  `@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
  and changes `clearMocks` to default `true`, tightens `coverage.include`/
  `exclude` matching, and removes several import entrypoints — exactly the
  class of change this repo's `Coverage (Full)` gate has already rotted on
  three times; a real migration, not a version bump). `@changesets/cli`
  2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
  1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
  `.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
  `ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
  map, not assumed. The root `uuid` override stays at `11.1.1` for the same
  reason, one level removed: it force-pins a transitive dep of `exceljs`
  (`^8.3.0`, itself already outside its own declared range on purpose), and
  `uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
  code does `require('uuid')`, verified directly in its installed `dist/`, so
  the same ESM-only trap applies one hop further down the graph.

  One more found by actually running the browser test tier, not just typecheck
  and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
  3.17.8 in this branch's first pass (a routine-looking override edit, not
  vetted as carefully as the deps above), and it broke
  `@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
  retries) — bisected down to virtual-core's own 3.17.7 "synchronous
  notification for scroll compensation" change, not to anything else in this
  branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
  code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
  bumps too, by reverting each in isolation and rebuilding). Reverted back to
  3.17.4, matching what's currently on `main`, and NOT bumped further.

  This surfaced something that predates this PR: `@pyreon/virtual`'s own
  `package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
  earlier fix (commit 973c4e323, "the root overrides pinned
  @tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
  the installed version did not satisfy its own consumers' declared range")
  — but the root override was only ever bumped to 3.17.4 there, not to
  3.17.7+, so the exact mismatch that fix describes is still live on `main`
  today: the declared floor and the resolved version disagree, silently,
  because the currently-resolved 3.17.4 happens to still pass. Bumping the
  override to actually satisfy the package's own declared range (3.17.7,
  confirmed — not just 3.17.8) is what surfaces the real compatibility break
  in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
  than fixed, because closing it needs either updating the wrapper for
  virtual-core's new synchronous-notification timing or re-adjudicating the
  test's assumptions against it — real source-level work, not a version
  bump. Tracked as a known gap, not silently left broken: someone picking
  this up should treat `bun run test:browser` in `@pyreon/virtual` as the
  regression gate, not just `bun run test`, which does not exercise this
  path at all (confirmed: the full node/happy-dom suite passes 1805/1805
  regardless of which virtual-core version is resolved).

- [#3775](https://github.com/pyreon/pyreon/pull/3775) [`725988f`](https://github.com/pyreon/pyreon/commit/725988fb737a586ef6440a78dea10cb39f869f04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Retarget web plot updates from the displayed frame when data changes during an animation. Preserve visible keyed bars and line positions, accept newer targets during universal shape transitions, and cancel active animations when updates are disabled.

- [#3674](https://github.com/pyreon/pyreon/pull/3674) [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

  Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

  Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

  `packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.

- [#3412](https://github.com/pyreon/pyreon/pull/3412) [`345493a`](https://github.com/pyreon/pyreon/commit/345493ab036b4d96e32019706853e9c72fbc65fd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The map family gets the draw-list golden every other family already had

  Counting hosts against `__goldens__/`: 19 chart hosts, 23 goldens, and exactly
  one family host with none — `map`.

  That gap mattered more than a missing row, because the geo reduction was
  refactored in the same session it was found: `Polygon` and `MultiPolygon` are
  the union collapsed into one normalised ring shape, and nothing in the suite
  would have noticed the reduction quietly dropping one of them.

  So the fixture is the one `geo.test.ts` uses — two polygons plus a
  MULTIPOLYGON of two smaller ones — and one region deliberately carries no
  value, so the output holds both geometry kinds, both ramp ends and the no-data
  fill: 4 polygons, `#e2e8f0` twice, and the ramp's low and high once each.

  Bisect-verified as load-bearing: making `geoShapes` drop MultiPolygon fails the
  golden with a snapshot mismatch, and nothing else in the suite reacts.

- [#3437](https://github.com/pyreon/pyreon/pull/3437) [`33388e8`](https://github.com/pyreon/pyreon/commit/33388e8ded998f953e864ed863e0bff42de2ac8f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(native): sma, ema and trend lower to iOS and Android

  The three indicator overlays cross into the native chart engine — `sma`, `ema`
  and `trend` emit real Swift and Kotlin rather than staying web-only, so a
  multiplatform chart carries the same indicator set as its web sibling. Charts'
  `engine/a11y.ts` gained the matching descriptions.

  (Recovered entry: this work shipped in [#3403](https://github.com/pyreon/pyreon/issues/3403) with an EMPTY changeset, which the
  Changeset gate accepted because it counted activity by path with the content
  unread — so the feature had no CHANGELOG line at all. The gate now rejects a
  changeset that declares no package.)

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower static pictorial-bar options to the native chart renderer on iOS and Android, including supported symbol shapes, repeated symbols, stacking, grouping, labels, colors, and patterns. Unsupported symbol shapes now produce a focused diagnostic and safely render as rectangles.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`b9c82f6`](https://github.com/pyreon/pyreon/commit/b9c82f6123f8d47481557b86b310914f5962a690), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d)]:
  - @pyreon/core@0.52.0
  - @pyreon/primitives@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/charts/webview` subpath — host real ECharts inside a native `<WebView>` (WKWebView on iOS, Android WebView) so full charting works on every target from one source. `buildChartHostHtml({ echartsScript? })` builds a self-contained host page (inlines your bundled ECharts for an offline, App-Store-safe page; CDN fallback for dev) that reads the pushed ECharts `option` from the `<WebView>` data bridge (`window.__pyreonData` + `pyreondata`), re-renders in place with no reload, forwards chart taps via `window.pyreonPostMessage`, and resizes via ResizeObserver (device rotation / late layout). `<ChartWebView option onSelect>` is the web-side ergonomic wrapper (emits `<WebView>`); native apps use `<WebView html={buildChartHostHtml(...)} data={option} onMessage={…}>` directly. Real-ECharts-in-a-real-iframe bridge proof in the browser suite (forward push → canvas render → in-place update; reverse tap → onSelect). (a0c0555)

  The host is performance-tuned: rapid data pushes COALESCE to one render per frame (rAF), and a data-only change MERGES (ECharts' fast animated diff) while a structural change (series added/removed/retyped) full-replaces — verified by a real-Chromium perf test (coalescing, merge-vs-replace, single instance, a 1,000-point series, graceful malformed-data handling). A 22-chart-type gallery test proves the host renders the full ECharts vocabulary (sankey/graph/tree/treemap/sunburst/radar/gauge/funnel/heatmap/candlestick/boxplot/…), not just bar/line/pie.

### Patch Changes

- `@pyreon/loom`: the phantom detector now recognizes the DefinitelyTyped (19ee507)
  pattern (a declared `@types/x` twin satisfies a type-only import of `x`,
  scoped names included), the lexical scanner requires the import KEYWORD to
  sit in code (a `from '…'` inside a string — rule messages, fix catalogs,
  generated examples — never scans as an import), subtrees with their own
  package.json are separate units, and a root `loom.ignore` (reason
  REQUIRED) downgrades findings to info with the reason attached — never a
  silent drop.

  The other packages: devDependency range alignment only (same-major sync
  surfaced by `loom scan`); no runtime change.

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/primitives@0.51.0
  - @pyreon/core@0.51.0

## 0.50.0

### Minor Changes

- [#2460](https://github.com/pyreon/pyreon/pull/2460) [`5dd6c80`](https://github.com/pyreon/pyreon/commit/5dd6c809127fe653009c867a8ccd2ca4ae5c6005) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Audit-gap release — reactive theme, escape hatches, and mount fast path:

  - **Reactive theme**: `theme` now accepts an accessor (`theme: () => (dark() ? 'dark' : null)`) — a flip disposes + re-inits the instance with the current option, group, and event handlers preserved (ECharts has no in-place theme swap; dispose+re-init is the mechanism, as in vue-echarts). Plain values stay static; a same-value re-run never swaps.
  - **`getCore()` + `connect()` exported** — unblocks `registerMap` (map charts were advertised but unusable without it), `registerTheme`, `getInstanceByDom`, and linked charts via the new `group` config + `connect(groupId)`.
  - **`initOptions` passthrough** to `core.init` (`useDirtyRect`, `useCoarsePointer`, `pointerSize`, …) and full `SetOptionOpts` on reactive updates (adds `silent`, `transition`).
  - **`autoresize: boolean | { throttle }`** — opt out of the ResizeObserver or throttle resize storms (default unchanged: on, unthrottled).
  - **Cached-modules synchronous mount fast path**: once the needed ECharts modules are cached (2nd..Nth chart), the instance is created in the same task — no wrapper-imposed microtask delay (no blank-frame flicker). First mounts keep the lazy-load path.
  - New tests: theme-swap semantics (5 specs), GC-observable dispose-leak lock (WeakRef + --expose-gc), autoresize config, sync-mount fast path.

### Patch Changes

- [#2471](https://github.com/pyreon/pyreon/pull/2471) [`825fc0e`](https://github.com/pyreon/pyreon/commit/825fc0ea7876d96635a1b714d4f63f0c5e6e017d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bench protocol upgrade: per-impl PROCESS ISOLATION (fresh child per impl ×3, pooled samples) + bootstrap CI95 with 🤝 tie detection — the store-bench lesson applied. Re-measured verdicts: reactive update ~9.4× faster, dispose ~2.3× faster, and mount is now a CI95-overlap TIE (the prior "~1.65–1.9× slower mount" was single-process order bias + the pre-fast-path loader). vue-echarts driver stays a tracked follow-up. No runtime changes.

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Minor Changes

- [#2233](https://github.com/pyreon/pyreon/pull/2233) [`43103c5`](https://github.com/pyreon/pyreon/commit/43103c50716ea3bc41d79281ac72947807301558) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(charts): general `onEvents` map, reactive `showLoading`, and `replaceMerge`

  - **`onEvents`** — bind ANY ECharts event by name (`legendselectchanged`, `datazoom`, `brushselected`, `finished`, …), not just the three `onClick`/`onMouseover`/`onMouseout` shorthands (which now merge into the same map). Each handler receives `(params, instance)`. Binding is leak-safe: a changed handler swaps the listener (no pile-up) and all listeners are removed on unmount.
  - **`showLoading` / `loadingOption`** — reactively toggle ECharts' built-in loading overlay (distinct from `useChart`'s module-`loading` signal).
  - **`replaceMerge`** — forwarded to `setOption` so a signal change can REPLACE (not merge) named components/series.
  - Perf: removed a redundant init-time `setOption` (the reactive-update effect already applies the first option with the configured merge opts) — one `setOption` per mount instead of two.

  Event handler type widened from `(params) => void` to `(params, instance) => void` (extra optional arg — non-breaking). New export: `ChartEventHandler`.

### Patch Changes

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1680](https://github.com/pyreon/pyreon/pull/1680) [`611694e`](https://github.com/pyreon/pyreon/commit/611694e815dcb454b2d82128315af69eb1649d40) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(charts): `<Chart>` now forwards `onInit` / `locale` / `notMerge` / `lazyUpdate` to `useChart`. These were documented as `<Chart>` props in the README but were neither declared on `ChartProps` nor passed through — only `theme` and `renderer` reached `useChart` (which already supported all four). Setting them on `<Chart>` now works end-to-end.

- [#1830](https://github.com/pyreon/pyreon/pull/1830) [`1ed4ff7`](https://github.com/pyreon/pyreon/commit/1ed4ff734f7535e42e910ed4fceafcf5d46a3974) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Chart>` now accepts an `ariaLabel` prop. A chart renders to canvas/SVG, which is opaque to screen readers — without a text alternative it's entirely invisible. When `ariaLabel` is set, the container becomes `role="img"` with that `aria-label` (the WAI pattern for presenting a complex graphic as a single labeled image); without it the container stays bare (a nameless `role="img"` would be worse than none), so there's no change for existing charts. Pass a concise description of what the chart conveys, e.g. `ariaLabel="Bar chart: monthly revenue trending up"`.

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.29.0

### Patch Changes

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.28.1

### Patch Changes

- [#1215](https://github.com/pyreon/pyreon/pull/1215) [`deb27dd`](https://github.com/pyreon/pyreon/commit/deb27dd1b10d5ce5e0a723daf013fda5f1caea7e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements. Add loader error-path tests (`_wrapTslibError` happy/passthrough/non-Error cases + `getCoreSync` peek). Exclude `use-chart.ts` from node-side coverage — its `ResizeObserver` callback + chart init/setOption error paths require real Chromium, already covered by `charts.browser.test.tsx` in `@vitest/browser`. Bump `coverageThresholds.statements` 94 → 95.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#945](https://github.com/pyreon/pyreon/pull/945) [`745fd63`](https://github.com/pyreon/pyreon/commit/745fd63c3ce97d0eb7bab37fa85ae40ed8c1c9bd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two DX walls surfaced by [#942](https://github.com/pyreon/pyreon/issues/942)'s HN-clone audit:

  **W10 — `useForm({ schema, validateOn: 'blur' })` now actually validates on blur.**
  Previously `setTouched()` only ran the per-field `validators[name]` function;
  the form-level `schema` only fired in `validate()` on submit. So a schema-only
  form (the canonical zod / valibot / arktype shape) with `validateOn: 'blur'`
  silently behaved like `'submit'` — the option name lied. Fix: when a schema
  is configured and the field has no per-field validator, `setTouched()` now
  runs the schema and applies ONLY this field's resulting error (other fields
  are left untouched so users aren't surprised with errors on fields they
  haven't visited). Versioned to discard stale results from interleaved
  blurs. 5 new specs in `tests/schema-blur.test.tsx`; bisect-verified.

  **W12 — `@pyreon/charts` now fails LOUD when the tslib alias is missing.**
  ECharts imports `tslib` for TypeScript helpers (`__extends`, `__assign`, …);
  tslib's CJS factory shape causes the named-helper destructure to read
  `undefined` unless the consumer's vite.config has the `chartsViteAlias()`
  alias. Without it, charts silently rendered as empty divs — the error
  was buried in a signal nobody read, taking ~25 minutes to diagnose.
  Now: (a) `getCore()` detects the tslib helper name in the error message
  and rewraps with a prescriptive "Add `chartsViteAlias()` to your
  vite.config" hint with the actual code snippet, (b) `<Chart>` surfaces
  the error to `console.error` AND renders an inline error display in dev.
  5 new specs in `tests/tslib-alias-detection.test.ts`; bisect-verified.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#730](https://github.com/pyreon/pyreon/pull/730) [`053c0a8`](https://github.com/pyreon/pyreon/commit/053c0a86d36b538489f1a0dd29561317eaa78c2b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(fundamentals): three correctness/leak bugs surfaced by the post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729) leak-class sweep

  Audit pass across all 22 `@pyreon/*` fundamentals packages for the same patterns that drove [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on a shared module-level stack) and [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation). Found 3 verified bugs in 2 packages (`@pyreon/hooks`, `@pyreon/storage`) plus one Class-F adjacent in `@pyreon/charts`. Each is bisect-verified or code-verified at source; each ships with an honest test or a clear in-source rationale.

  ### 1. `@pyreon/hooks` — `useDialog` crashes on unmount

  The ref callback typed its parameter as `(el: HTMLDialogElement) => void`. Pyreon's `RefCallback<T>` contract: refs fire with the element on mount AND with `null` on unmount. The pre-fix body unconditionally called `el.addEventListener('close', handler)` after assigning `dialogEl = el`, so when the ref fired with `null` on unmount, `null.addEventListener` threw `TypeError: Cannot read properties of null (reading 'addEventListener')`. Every consumer of `useDialog` crashed on unmount.

  Fix: ref param typed `HTMLDialogElement | null`; null path cleans up the previous binding and early-returns before the addEventListener call. Regression test in `useDialog.test.ts` bisect-verified: revert → `expected [Function] to not throw an error but 'TypeError: Cannot read properties of null'` was thrown; restored → pass.

  ### 2. `@pyreon/storage` — cross-tab listener detached when one consumer of N calls `.remove()`

  The `useStorage` cross-tab listener was retained ONCE per unique-key signal creation, NOT per consumer. Same-key cached returns skipped the retain. `.remove()` always released — driving the refcount below the actual consumer count.

  Real-app symptom: N components each call `useStorage('theme', 'light')`. They all share the same cached signal (correct). One component calls `.remove()` (clear storage, reset to default). The cross-tab listener is detached AND the registry entry is deleted. Now cross-tab `storage` events for 'theme' don't reach the surviving N-1 consumers — they're silently orphaned from the cross-tab pipeline.

  Fix:

  - Same-key cached returns ALSO retain the cross-tab listener (refcount now matches consumer count).
  - `.remove()` no longer deletes the registry entry — keeps it so the listener's dispatch table remains intact for surviving consumers. The registry entry is small (one Map entry per key); the residual cost is negligible vs silently breaking cross-tab sync.

  Regression test in new `cross-tab-refcount.test.ts` — bisect-verified: revert → `Expected: "dark", Received: "light"` (surviving consumer never received the cross-tab event); restored → pass.

  NOT fixed in this PR (deliberate scope): `.remove()` idempotency from the same consumer. Currently `t.remove(); t.remove()` double-releases the refcount. The fix requires per-consumer disposal state (separate wrapper per `useStorage` call), which is a larger refactor.

  ### 3. `@pyreon/charts` + `@pyreon/storage` — rejected dynamic-import / IndexedDB-open cached forever (Class F)

  Both `@pyreon/charts/src/loader.ts:loadAndRegister` and `@pyreon/storage/src/indexed-db.ts:openDB` cached `loader().then(...)` (resp. `new Promise(...)`) in a module-level `Map<string, Promise<...>>` keyed by module name / db key. Without a `.catch` clearing the entry on rejection, a single transient failure (CDN blip during initial chart render, IndexedDB quota exceeded) cached the rejected promise FOREVER — every subsequent retry of the same key returned the same cached rejection until page reload.

  Memory cost: bounded by ~50 module keys (charts) or unique `(dbName, storeName)` pairs (storage). Functional cost: the affected feature is permanently broken until reload.

  Fix: `.catch(err => { inflight.delete(key); throw err })` (same shape in both files). The `.catch` re-throws so this attempt's caller still sees the original error; subsequent retries get a fresh import / open attempt.

  Code-verified at source; no dedicated regression test in this PR (requires either mocked dynamic-import infra for charts, or a fake-indexeddb harness for storage — separable follow-ups).

  ### Audit byproducts (NOT fixed in this PR)
  - `@pyreon/code` `<CodeEditor>` component does not call `instance.dispose()` on unmount. Could be a design choice (user owns lifecycle since `instance` is an external prop) OR a documentation gap. Worth deciding deliberately, not bundled here.
  - `@pyreon/state-tree` `_hookRegistry` accepts dynamic IDs without bound — would leak if app generates IDs at runtime (uncommon — typical usage is static IDs).
  - `@pyreon/url-state` per-instance popstate listeners (no shared registry like storage has) — inefficient at scale but not a leak.
  - `@pyreon/rx` `distinct` / `scan` effects do not expose `dispose` while `debounce` / `throttle` do — minor API inconsistency only matters in out-of-component usage.

  All separately filed-worthy; deliberately scoped out of this PR.

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes
  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements
  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.
