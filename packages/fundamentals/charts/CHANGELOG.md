# @pyreon/charts

## 0.52.0

### Minor Changes

- Add an explicit reactive option update policy to `OptionChart`. Applications can recursively merge partial updates, replace the complete option, or replace selected top-level component collections while merging the rest. Component collections match entries by stable id, then name, then position, and caller-owned objects are never mutated. (f2b1d43)
- Option axes now draw ECharts' `splitArea`: bands between the ticks, the colours cycled from the axis start, one per category on a category axis. A value axis draws `minorTick` and `minorSplitLine`, each interval cut into `minorTick.splitNumber` pieces. Series labels read `label.rotate` (about the anchor, with `offset` turned with it, as zrender does), `offset`, `align` and `verticalAlign`. An ECharts differential holds all of it. All of it crosses to iOS and Android through the engine, and the three axis keys no longer warn there. (896d747)

  The native chart spec printer wrote every array field as numbers, which turned a colour list into `[NaN, NaN]`. It now keeps strings.

- Two marks the cartesian surface was missing, and two that were unreachable. (e83a9bf)

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

- Line and area points on a category axis now sit at their band centres, under their category labels and over any bar in the same band, as ECharts draws them (its default `boundaryGap: true`). Before, the points ran edge to edge while the labels sat at band centres, so every category line chart drew its first point half a band left of its label; this applies to `PlotChart` and `<OptionChart>` alike. `xAxis.boundaryGap: false` gives the edge-to-edge layout, with the labels moved onto the points. A chart with bars keeps its bands. `markLine` and `markArea` now take a category name for `xAxis`, as ECharts does, and land on the same band positions. The native engine is regenerated with the same geometry. (896d747)
- Boxplot family: `fiveNumber` (R-7 interpolated quartiles, Tukey 1.5-IQR fences, outliers), `boxplotExtent`, `renderBoxplot` (whiskers with caps, Q1–Q3 box, median line, outlier dots, entrance growing from the median), `hitBox`, `<BoxplotChart>` (reactive canvas host over raw observations, `onSelect`, accessible summary table), `boxplotToSvg` (server-safe, accepts precomputed summaries), and the option facade maps `type: 'boxplot'` (ECharts' `[min, Q1, median, Q3, max]` tuples, with a companion `scatter` series read as outliers). Conformance corpus 18 → 19, floor 16 → 17. (5dca722)
- Calendar family: `layoutCalendar` (a day-per-cell grid over an ISO date range — weekday rows with `firstDay` rotation, week columns, month labels at each month's first column, alternating weekday labels, fit-to-box or fixed `cellSize`; strict ISO parsing that rejects impossible dates), `renderCalendar` (values through the shared heat ramp with a data or fixed `domain`, `emptyColor` for days without data, week-by-week entrance), `hitCalendar`, `<CalendarChart>` (reactive canvas host, `onSelect(cell)`, accessible table), `calendarToSvg` (server-safe), and the option facade maps a `heatmap` series on `coordinateSystem: 'calendar'` (`calendar.range` as year / `YYYY-MM` / date / `[start, end]`, `cellSize`, `dayLabel.firstDay`, `dayLabel.show`, `monthLabel.show`, `visualMap` colours + min/max; `orient: 'vertical'` warns; a malformed datum warns by index). Conformance corpus 23 → 24, floor 21 → 22. (e2e40da)
- A candlestick option's `dataZoom` is now interactive on the web. A `slider` draws ECharts' strip under the chart; drag the band or a handle to move the window. `inside` zooms on the wheel and pans on a drag inside the plot, and `zoomLock` and `minSpan` / `maxSpan` hold. `<CandlestickChart>` gains the matching `zoom` prop, and a click still reports the GLOBAL candle index. `optionToSvg` draws the opening window. (896d747)
- Adds `<ChordChart>` — flows between categories as ribbons across a circle — (7b1351b)
  closing the last ECharts series with no Pyreon path on any tier.

  It takes sankey's `{ nodes, links }` verbatim, and the ECharts-shaped `chord`
  series compiles through `compileOption` too, so moving a spec between the two
  is a one-word edit. The difference is what the layout encodes: a sankey lays
  flows on an axis, so it reads a direction and wants an acyclic graph; a chord
  closes the circle and drops both, which makes a flow that goes BOTH ways
  (imports and exports, migration between regions, a confusion matrix) its
  ordinary case rather than its awkward one.

  Lowers to SwiftUI and Jetpack Compose like its neighbours, compile-proven on
  both real toolchains.

- Charts: a horizontal bar option (a category y axis over a value x axis) now lays out as ECharts does — it previously drew nothing, on web and native — including split areas and minor lines on the value axis. A scrolling legend clips the entry the window cuts instead of dropping it, pages vertically, and honours `pageButtonPosition: 'start'`; the draw list gains `clip` / `unclip` commands, executed by the canvas, SVG, SwiftUI and Compose painters. Rich and multi-line labels now rotate as one block, with ECharts' line height. (896d747)
- The ECharts series keys every series type shares, honoured on `<OptionChart>`. (896d747)

  - **Per-datum colour.** A datum's own `itemStyle.color`, and `colorBy: 'data'`
    (a palette colour per datum), now paint. They were dropped silently. The
    engine's `Series` gains an `itemColors` channel, generated into the native
    engines, and every datum fill (bars, stacked and grouped segments,
    waterfall steps, points) goes through it, so hover, select and blur act on
    the datum's own colour.
  - **`silent`** series are never hit: no tooltip, cursor or selection.
  - **`cursor`**: the pointer over an item shows the series' `cursor`, or
    `pointer` by default, as in ECharts.
  - **A series' own `tooltip`** refines the global tooltip for that series' items.
  - **`universalTransition`** on a series turns the morph on for the chart.
  - `id` (used by the `setOption` merge), `seriesLayoutBy` and `datasetId` (used
    by the dataset pass) no longer draw a "no mapping" warning; they were
    already honoured.
  - A tooltip formatter's `params.seriesIndex` is now the option's own series
    index, even when an unsupported series was skipped.

  The shared canvas host gains a `cursor` hook. The measured contract drops from
  1,011 to 947 unmapped series keys.

- Custom series in the option facade: `type: 'custom'` with ECharts' `renderItem(params, api)` — `api.value` / `api.coord` / `api.size` / `api.style` / `api.visual` map data to pixels through the chart's own layout, returned elements lower through the same graphic vocabulary as the `graphic` option (rect, circle, line, polygon, polyline, text, group), `encode.x` / `encode.y` feed the axis extents, `null` items are skipped and a throwing `renderItem` warns per datum. `customCommands` is exported for hosts. Conformance corpus 31 → 32, floor 29 → 30. (fea7fde)
- `@pyreon/charts/plot` datasets: `registerChartTransform` accepts external transforms in the `echarts.registerTransform` shape (the same `upstream` surface, so ecStat transform objects register unchanged); a multi-result transform feeds `fromTransformResult`; datasets and series resolve by `id` / `datasetId` / `fromDatasetId`; `encode.seriesName` names a series after a dimension and `encode.itemName` names each datum. Unknown transform types still warn by name. (f2b1d43)
- `dataset.transform` in the option facade's dataset pre-pass: `filter` (comparison conditions — `gt`/`gte`/`lt`/`lte`/`eq`/`ne` and their symbol spellings — composed with `and` / `or` / `not`), `sort` (one key or several, `asc`/`desc`, numeric or string), chained transforms per dataset, and `fromDatasetIndex` so derived datasets build on each other; series pick a derived dataset with `datasetIndex`. Unknown transform types and dimensions warn by name and pass the table through unchanged. Conformance corpus 29 → 30, floor 27 → 28. (05f4b35)
- dataZoom + brush on `PlotChart` (ECharts' inside dataZoom + brush select). `dataZoom` adds wheel-zoom that keeps the datum under the cursor fixed, drag-pan by plot-widths, and double-click reset; `brush` adds drag-selection reporting a GLOBAL inclusive datum range through `onBrush` (Shift+drag when both gestures are on), with a persistent highlight band cleared by the next click (`onBrush(null)`). The window is a fraction pair over the data (`zoom.ts` — pure, host-agnostic math: `zoomWindow`/`panWindow`/`sliceRange`/`brushRange`), and the host slices rows through it, so geometry, hit-testing, tooltips and the accessible table stay correct with zero engine awareness. Accessors and callbacks always see GLOBAL indices — a zoom never renumbers your data. The wheel is captured (preventDefault) over a zoomable plot; drags suppress the click so panning never fires `onSelect`. (524c7b1)
- Decimation crosses to iOS and Android, and LTTB stops duplicating its last point (fbb41d9)

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

- Charts look right out of the box: (896d747)

  - **Legend and colour by label** (web and native). Marks sharing a label share one legend entry, which toggles all of them, and one palette colour, as ECharts treats a series name. An area under a line, both labelled Revenue, no longer shows two Revenue swatches in two colours.
  - **Area marks** fill translucent (0.3) by default instead of opaque; the new `areaOpacity` mark option sets it.
  - **Charts follow the page's declared scheme.** They read the CSS `color-scheme` on `<html>` when it names one, else the OS preference, so a site with its own theme toggle gets matching charts.
  - **`<OptionChart>` honours an explicit `<ChartThemeProvider>`**, for both cartesian and family options (it ignored one before). A bare option chart keeps ECharts' own light look, as ECharts does.
  - **Dark gauges.** Under a non-default theme a gauge takes the theme's text and label colours instead of ECharts' light-theme greys.
  - **SVG themes.** `optionToSvg`'s `theme` now reaches family charts too.
  - **Candlesticks.** A candlestick's x labels thin and slant to what fits instead of overlapping, and its `dataZoom` opening window is applied.

- `smooth` and `step` are now exported from the `@pyreon/charts` root, so a `<Line curve={smooth}>` needs no `/engine` import. The docs, README and manifest examples now use the `<Chart>` grammar. The typed-channel claim is corrected: `<Chart<Row>>` checks its own channels, but a mark checks its field names only when given the row type (`<Bar<Row> y="revenue">`). The charts import migration routes `smooth`/`step` to the root. (d5a7c06)
- Dual y-axes at the engine level. A mark opts in with `axis: 'right'` (`MarkOptions.axis`, carried onto `Series.axis`); the right domain derives from right-axis series or pins via `ChartSpec.y2Domain`/`ChartToSvgOptions.y2Domain`, with its own `y2Format`. The right gutter is measured from the y2 tick labels exactly like the left one, the right axis line + `start`-aligned labels render when a right series exists, and each independent series scales against ITS axis. Three deliberate pins, none silent: stacked/grouped stay left (one stack, one scale), horizontal frames stay single-axis, and a chart whose EVERY series is right falls back to left. `chartToSvg` carries the options, so dual-axis charts work server-side today; the `PlotChart` prop plumb follows once the interaction wave lands. (17596f4)
- An option line with `areaStyle` now draws as ECharts does. It stays a line, with its stroke and symbols drawn over a fill at ECharts' 0.7 opacity; before, it was an opaque polygon with no line. `areaStyle.opacity`, `color` and `origin` (`auto` closes to zero, or the nearer edge; `start`, `end` or a value) are read, so a range through zero closes to the zero line instead of the floor. Compared against ECharts' SVG. (896d747)
- Option axis tick labels sit where ECharts puts them. They are 8px off the axis (`axisLabel.margin`), and `axisLabel.inside` moves them onto the plot's side. The y axis now reads `axisLabel.rotate`, turning each label about its anchor, and its gutter holds the turned box. Every label's anchor, alignment and rotation is compared against ECharts' SVG. (896d747)
- Option axes draw their lines, ticks and split lines as ECharts does. An axis shows its line and ticks only when the other axis is a value axis, and a category axis on bands drops its ticks. So a bar chart's value axis has no line, and a value-by-value scatter has both lines, ticks and vertical split lines. `axisLine` (`show`, `lineStyle`) and `axisTick` (`show`, `length`, `inside`, `alignWithLabel`, `lineStyle`) are read, and so is `splitLine.lineStyle` (colour, width, `dashed` / `dotted` / custom dash). The second y axis draws its own split lines. `axisLine.onZero` (on by default) moves an axis line and its ticks onto the other axis's zero when that range crosses it; the labels stay at the edge. Compared stroke by stroke against ECharts' SVG. (896d747)
- `<OptionChart>` lays bars out the way ECharts does, checked against ECharts' own SSR output. A single series now leaves ECharts' 31% category gap (was 25%). Grouped series use its `max(35 − 4 × columns, 15)%` category gap and 10% bar gap. `barWidth`, `barMaxWidth` and `barMinWidth` (pixels or percent), `barGap` (including `'-100%'` overlap) and `barCategoryGap` are now honoured, and a stack is one column. `barsFor` now returns a stacked or grouped series' own rects, so a tooltip `position` and the focus ring find those bars. The native engine is regenerated. (896d747)
- Option bar labels sit and colour themselves as ECharts does. They sit inside the bar by default, and `label.position` (`top`, `bottom`, `left`, `right`, `inside*` and the inside corners) and `distance` are read. An unstyled label takes zrender's automatic fill: light text haloed in the bar's colour inside it, dark text haloed in the background outside. `textBorderColor` and `textBorderWidth` set the halo. Text draw commands gain an optional halo (`stroke` and `strokeWidth`), painted by the web canvas, the SVG export and both native canvases. (896d747)
- OptionChart and optionToSvg now lay a cartesian option out on ECharts 6's default grid. The plot sits 15% from the left, 65 px from the top, 10% from the right and 80 px from the bottom. It grows only where an axis label would otherwise leave the chart (`outerBoundsMode: 'auto'`). The title, legend and dataZoom slider draw in the grid's margins, as in ECharts, instead of pushing the plot around. (896d747)

  This is a visible change: option charts gain ECharts' margins. Pass a `grid` to place the plot yourself.

  - **Line symbols:** a line series shows ECharts' default `emptyCircle` at its data. `showSymbol: false` or `symbol: 'none'` hides them. `showAllSymbol` is read. A crowded category axis keeps only the symbols at its label interval, as ECharts does. Empty symbols (`emptyCircle`, `emptyRect`, …) draw as a ring round the chart surface.
  - **Axis labels:** category x-axis labels thin by ECharts' own `calculateCategoryInterval` instead of rotating. `axisLabel.rotate` and `axisLabel.interval` are read.
  - **Text:** option text is 12 px, ECharts' size, unless the theme sets one.

  All of this is checked against ECharts' own SSR output: plot rects, symbol positions and tick labels.

- Option line series take their shape from ECharts. `smooth` draws ECharts' own Bézier per segment (0.5 for `true`, with `smoothMonotone: 'x' | 'y'` read), instead of a monotone cubic. `step: true` / `'start'` now rises first, as ECharts does; `'middle'` and `'end'` are drawn too. `connectNulls` bridges a missing value instead of breaking the line. Each shape is compared against ECharts' own SVG path. (896d747)
- Option line and scatter labels sit where ECharts puts them: a line's above its symbol, a scatter point's inside it, both against the symbol's box and with the same automatic colours as bar labels. A line with `showSymbol: false` shows no labels, as in ECharts. Scatter points default to ECharts' `symbolSize` of 10 (they were drawn at 6). (896d747)
- An option chart's `legend.type: 'scroll'` now pages as ECharts' does. When the entries overflow, they stay on one line, clipped short of ECharts' page controller at the end: a prev arrow, `{current}/{total}` and a next arrow, each arrow dimmed when there is no page that way. The line starts at `scrollDataIndex`, and pages break where ECharts breaks them, so an entry the edge cuts opens the next page. Clicking an arrow pages it. `pageButtonGap`, `pageFormatter` and the page colours are read. A 9-case differential against ECharts holds the controller and the whole entries each page shows. (896d747)

  Native draws such a legend unpaged, and now says so in a warning instead of silently.

- An option chart's slider `dataZoom` is now ECharts' own slider. It sits under the plot in the grid's bottom margin, laid out in the whole chart with `left` / `right` / `top` / `bottom` / `width` / `height` honoured. It draws the data shadow (padded 30% of the span), the window filler, 15px handles 1px inside the window ends, and the brush move handle above it. A 7-case differential against ECharts' SSR output holds its geometry to half a pixel. Pressing the move handle drags the window. PlotChart's own navigator is unchanged. (896d747)
- Stacks now follow ECharts' `dataStack`, and negative values in a stack are no (812c47d)
  longer dropped. A stacked bar with a negative value used to lose that segment
  silently, and its value axis ignored the negatives. Stacks now diverge from
  zero as ECharts' default `stackStrategy: 'samesign'` does: positives up,
  negatives down. `stackStrategy: 'all' | 'positive' | 'negative'`,
  `stackOrder: 'seriesDesc'` and separate `stack` groups are honoured for bars
  and lines on both facades. Two differently named stacks used to share one
  running total. The engine exposes this as `stackLevels`,
  `layoutStackLevels(H)` and `stackLevelsExtent`; `layoutStackedBars(H)` and
  `stackedExtent` keep their signatures with the new, ECharts-default
  behaviour.

  Bars honour `barMinHeight`: a shorter bar grows to it from its base, clipped
  to the grid. `showBackground` draws a strip behind each bar in
  `backgroundStyle.color` and `opacity`.

  A `NaN` datum is ECharts' empty datum, like `null` and `'-'`: it leaves a gap
  instead of being zeroed with a warning. A scatter series with `stack` now
  warns that scatter points do not stack.

  Differential-tested against ECharts' own output: 18 bar-rect cases and 4
  stacked-line cases compared on its stacked data model.

- An option chart's default tooltip (no `formatter`) now shows exactly what ECharts shows. It has a header and, per value, a round colour swatch, the name, and the value in bold at the right, comma-grouped (`2,500`) unless a `valueFormatter` shapes it. The box is edged in the series colour for an item tooltip. It is locked by a browser differential against real ECharts. A pie's family tooltip no longer appends a `(100%)` share. (896d747)

  On native, an option pie's tooltip draws the same rows through the new engine `renderTooltipRows` / `pieTipRowsWith`, and a tooltip `valueFormatter` (a function) no longer costs a native option pie its arcs, labels and placement.

- `<OptionChart>`'s value axes now tick exactly as ECharts does, checked against ECharts' own SSR output by a new differential test. The changes: (896d747)

  - Zero stays in view unless `yAxis.scale: true`; before, a line chart's axis was fitted to the data.
  - The interval is ECharts' `nice(span / splitNumber)`, which also steps by 3 (for example 0, 300, 600 where the facade drew 0, 500, 1000).
  - `splitNumber` is read.
  - A lone `min` or `max`, or `'dataMin'` / `'dataMax'`, pins that side, and a pinned bound is a tick of its own.
  - Default labels group thousands (`1,500`).

  `PlotChart`'s ticks are unchanged. The engine gains `ChartSpec.ySplit`, `yZero`, `yMin`, `yMax`, `yMinData`, `yMaxData` and `Domain.step`, and the native engine is regenerated.

- `<OptionChart>`'s value X axis (a scatter's, or a value-axis line's) now ticks as ECharts does, checked against ECharts' SSR output. Zero stays in view unless `scale: true`, the interval is ECharts' `nice(span / splitNumber)`, `min`/`max` (including `'dataMin'`/`'dataMax'`) are read, and labels group thousands. Before, the axis spanned the raw data extent. An inverted axis now keeps its tick step. (896d747)
- Two cartesian variants in the engine: `Series.effect` draws two translucent halo rings under every point (the effectScatter look, frozen at a frame and scaled with the entrance), and `Series.symbol` + `symbolRepeat` draw bars as a stretched or repeated symbol (`rect` / `circle` / `diamond` / `triangle` — the pictorialBar look, repeating along the bar's own axis and dropping a partial last unit). Exposed on the mark options (`points(y, { effect })`, `bars(y, { symbol, symbolRepeat })`) and mapped by the option facade (`type: 'effectScatter'`, `type: 'pictorialBar'` incl. `stack`/grouped; a path or image symbol falls back to a rect with a warning). The generated native chart engine carries both. Conformance corpus 30 → 31, floor 28 → 29. (05f4b35)
- `encode.tooltip` over a dataset resolves to the new `Series.extras` (`[{ label, numbers | texts }]`): the tooltip lists the named dimensions under the series value and the accessible table prints one column per extra. An unknown dimension warns by name and is skipped. (f2b1d43)
- **Breaking:** `@pyreon/charts` is now Pyreon's own chart engine, with `<Chart>` as the main component. The ECharts wrapper moves to `@pyreon/charts/echarts`. (d5a7c06)

  | Before                                                                         | After                                                                                               |
  | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
  | `import { Chart, useChart } from '@pyreon/charts'` (ECharts)                   | `import { EChart, useChart } from '@pyreon/charts/echarts'`                                         |
  | `ChartProps`, `ChartTheme` (ECharts types)                                     | `EChartProps`, `EChartTheme` from `@pyreon/charts/echarts`                                          |
  | `@pyreon/charts/manual`, `@pyreon/charts/vite`                                 | `@pyreon/charts/echarts/manual`, `@pyreon/charts/echarts/vite`                                      |
  | `import { Plot, … } from '@pyreon/charts/plot'`                                | `import { Chart, … } from '@pyreon/charts'` (`Plot` is renamed `Chart`, `PlotProps` → `ChartProps`) |
  | `OptionChart`, `optionToSvg` from `/plot`                                      | `@pyreon/charts/option`                                                                             |
  | `chartToSvg` and the `*ToSvg` family from `/plot`                              | `@pyreon/charts/svg`                                                                                |
  | everything else from `/plot` (`PlotChart`, mark factories, layouts, hit tests) | `@pyreon/charts/engine`                                                                             |

  `@pyreon/charts/plot` is removed; there are no aliases. The main entry is a curated surface: `<Chart>` and its marks, the family components, formatters, theme and linking, plus the data types those take. `/engine` exports the rest and is outside the stability promise.

  On native, the compiler treats the main entry, `/engine`, `/option` and `/svg` as the engine, and `<Chart>` desugars as `<Plot>` did. `/echarts` is the only web-only entry. The package's multiplatform tier moves from `web-only` to `shared`.

- `<PlotChart>` events: `onClick`, `onDoubleClick`, `onContextMenu` (the datum under the pointer, -1 for a miss, independent of `selectedMode`) and `onRendered` (after each paint); the handle's `dispatch` accepts `showTip` / `hideTip` / `legendAllSelect` / `legendInverseSelect`, and the handle tracks the bound chart's `seriesCount`. The native compiler names the four new events as web-only. (f2b1d43)
- The events/actions model for `<PlotChart>` (ECharts' `on(...)` / `dispatchAction`, Pyreon-shaped). `selectedMode="single" | "multiple"` pins a picked datum (click or keyboard Enter) with a heavy outline that stays and reports the pinned set through `onSelectChange` (GLOBAL indices); `onHighlight` reports the hovered datum and -1 on leave, `onLegendChange` the hidden series, `onZoom` the window — each from one source of truth, so a dispatch fires them exactly as a gesture does. `createChartHandle()` is the imperative handle: a link (`zoom`, `hover`) plus `selected` and `hidden` signals that ARE the chart's state, and `dispatch` over `highlight` / `downplay` / `select` / `unselect` / `toggleSelect` / `legendSelect` / `legendUnselect` / `legendToggle` / `dataZoom` / `restore`; a handle passed as `link` to siblings connects them. The engine draws the emphasis itself — `ChartSpec.emphasis` puts a faint band under the highlighted column and outlines its bars and points, a heavier outline on a pin — so the SVG and the generated native engines carry it in the same draw list. On native the new props warn by name (event props included, which the old filter never matched) and the chart renders without them. (e6ef4e3)
- Family option charts honour ECharts' `colorBy` and `universalTransition`. Pie, funnel, radar, chord and theme river colour each datum from the palette by default; `colorBy: 'series'` makes them one series colour. A graph's uncategorised nodes now take the series colour by default, as in ECharts, and `colorBy: 'data'` colours them per node. A family series' `universalTransition` now lets its host morph an update that changes the item count. Before, it was dropped, and a slice-count change snapped. (896d747)
- A family series fed by a `dataset` is now mapped the way ECharts maps it. Candlestick (`[open, close, lowest, highest]`), boxplot (five numbers), heatmap (`[x, y, value]`), radar (a named polygon per row), parallel (a line per row), theme river (`[date, value, name]`), gauge and map now read their own tuple shape through `encode`. Before, they read one value column and came out wrong. A series' own `dimensions` now names the columns it reads, and the dataset keys (`datasetIndex`, `datasetId`, `seriesLayoutBy`, `dimensions`, `encode`) are declared for every family that consumes them. `seriesLayoutBy` on graph, sankey, tree and chord is recorded as inert, because ECharts builds those series from their own data and never from a dataset. (896d747)
- `<GanttChart>` + `layoutGantt` / `renderGantt` / `hitGantt` / `ganttToSvg` — the Gantt family: one row per task on a calendar-aligned time axis (day/week/month/quarter/year ticks picked by span), lane headers per group, progress insets, milestone diamonds, dependency elbows, a dashed today marker, an entrance progress, and the same reactive canvas host + accessible table as every other family. (6ea2c9c)
- `<OptionChart>` applies the option's `tooltip` component to family charts (pie, funnel, gauge, radar, candlestick, heatmap, treemap, sunburst, tree, sankey, graph, chord, calendar, parallel, polar, theme river, map). Before, a family option showed no tooltip at all. The option's `trigger`, `triggerOn`, template and function `formatter` (with ECharts' `params`, including the pie's largest-remainder `percent`), `valueFormatter`, `position` and look now apply, refined by a series' own `tooltip`. A series' `cursor` and `silent` apply too. The facade's `rtl`, `toolbox`, `keyboard` and `accessibleTable` props now reach a family host, and a family layer's box mirrors under `rtl`. The canvas host gains `itemTooltip`, `itemCursor` and `itemSilent` props, applied to the item a family reports through its new `item` hook. (896d747)
- The grammar covers the row-array families. `<Plot>` takes four family marks — `<Arc value label color? innerRadius?>` (pie / donut), `<Stage value label color? sort? gap? …>` (funnel), `<Cell x y value colors? gap?>` (heatmap) and `<Candle open high low close upColor? downColor? widthRatio?>` (candlestick, the plot's `x` channel labels each period) — and renders that family's host instead of the cartesian plot, channels as accessors, the mark's options where the host keeps them; `<Tip>`, `<Legend>` and `<Axis y format>` still apply. One family per plot: a second family mark, or a cartesian mark beside one, is reported and ignored. Two more cartesian children: `<Label text at series color radius>` declares the engine's datum-anchored point markers (`at="max"` / `"min"` / an index) and `<Rule x>` a vertical reference line. On native the compiler desugars a family plot to the host it names, byte-identical to writing that host directly, so the accessor inlining, the chrome, the tap and the entrance are inherited. `Label`, not `Text`: `<Text>` is the canonical primitive and the native compiler dispatches on the tag name. (50a5cea)
- Server-side SVG for the whole chart family: `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg` and `heatmapToSvg` join `chartToSvg` — pure functions over the engine's geometry with `measureApprox` by default, so every chart type renders in an SSG build, a serverless function or an email pipeline, with the same derived accessible title/description contract. (17c081a)
- The finance family joins the interaction contract: `CandlestickChart` gains `onSelect` (candle index; the full column is the hit target, because a wick is one pixel wide) and an OHLC `tooltip`; `HeatmapChart` gains `onSelect` (the tapped CELL — categories plus aggregated value, null for a miss, and an undrawn cell IS a miss because absence is not selectable) and a cell `tooltip`. New pure hit helpers `hitCandle` and `hitHeatCell` ship from the engine, so the same geometry answers native hosts. (a7bc895)
- An ECharts funnel option now draws exactly as ECharts draws it. Stage sizes (b742c87)
  map values linearly from `min` / `max` onto `minSize` / `maxSize`. `orient:
'horizontal'` is supported, an ascending funnel is laid out from the far end,
  `gap` and `funnelAlign` behave as in ECharts (including `top` / `bottom` on a
  horizontal funnel), and per-item `itemStyle.height` / `width` is honoured.
  Every stage gets a border in the chart background. Labels sit outside on
  leader lines by default, and every ECharts label position is supported:
  `inside`, `insideLeft`, `insideRight`, `left`, `leftTop`, `rightBottom`, …, a
  `top` label on a vertical funnel moving to the left side as ECharts does. They
  take zrender's automatic colours, `inherit`, a template or a function
  `formatter`, and `labelLine.show` / `length`. The series box defaults to
  ECharts' 80 / 60 / 80 / 65 margins, and `left` / `top` / `right` / `bottom` /
  `width` / `height` place it. 32 cases are differential-tested against
  ECharts' own SSR output.

  `<FunnelChart>` gains an `echarts` prop carrying this layout; without it the
  component keeps its own simpler layout. On iOS and Android an option funnel
  still draws that simpler layout. The native chart engines are regenerated with
  the new layout functions, which nothing native calls yet.

- Funnel family: `layoutFunnel`/`renderFunnel`/`hitFunnel` (pure trapezoid geometry — descending/ascending/none sort that still names INPUT indices, per-stage taper toward the next stage, `minWidthRatio`, left/center/right alignment, entrance progress), `<FunnelChart>` (reactive canvas host with `onSelect` and the accessible table), `funnelToSvg` (server-safe), and the option facade maps `type: 'funnel'` (`sort`, `minSize`, `funnelAlign`, labels). Conformance corpus 17 → 18, floor 15 → 16. (33b353b)
- OptionChart and optionToSvg now draw a gauge the way ECharts does: (896d747)

  - the axis line in colour bands (`axisLine.lineStyle.color` stops, `roundCap`);
  - split lines, ticks and labels round the dial (lengths in pixels or percent of the radius, `auto` colours, label `formatter` / `rotate`);
  - a pointer and an optional progress arc per value (`overlap`, `clip`, `roundCap`);
  - the anchor, and each value's title and detail, with per-datum offsets;
  - the detail box (background, border, width, height, padding);
  - pointer and anchor icons (rect, circle, diamond, triangle, arrow);
  - `startAngle` / `endAngle` / `clockwise` / `min` / `max` / `splitNumber`.

  All of it is checked against ECharts' own SSR output. Text draw commands gain an optional `weight` ('bold'), drawn by the web canvas, the SVG string and both native canvases.

- Points and paths on a map: `renderGeoPoints` + `renderGeoPaths` / `hitGeoPoint` / `geoPointRadii` / `geoPointsToSvg` draw scatter and effectScatter symbols through a map layout's projection (value-scaled radii, halo rings, opt-in labels), and the option facade routes `scatter` / `effectScatter` / `lines` with `coordinateSystem: 'geo'` over the top-level `geo: { map, itemStyle }` (`[lon, lat, value]` data, `symbolSize`, per-point colours; other series types on geo warn by name). Conformance corpus 35 → 36, floor 33 → 34. (fea7fde)
- The option facade reads ECharts' linear gradient colour objects (`{ type: 'linear', x, y, x2, y2, colorStops }`) on `itemStyle`, `areaStyle`, `lineStyle` and the series `color` as the engine's series gradient: direction from the dominant axis, a backwards ramp reverses its stops, the first stop is the solid colour. A radial gradient warns by name and degrades to its first stop. (f2b1d43)
- Linear gradients — `gradient` on a bar-family or `area` mark (ECharts' `LinearGradient` item and area style), the second command of DrawCmd v2. You give the stops and a direction; the engine resolves the two points against the PLOT box, so one ramp spans the chart instead of repeating inside every bar, and the same mark reads correctly at any size. The web canvas builds a `CanvasGradient`, the SSR SVG emits a `<linearGradient>` in `<defs>` with `gradientUnits="userSpaceOnUse"` and references it by id, SwiftUI fills with a `.linearGradient` shading and Compose with a `Brush.linearGradient` — all from the same `ChartGradient` in the draw list. Every gradient-bearing command still carries its solid `fill`, so a backend that cannot paint one, or a caller serializing commands without a `<defs>` to put them in, falls back to the colour rather than to nothing. (e6ef4e3)
- **The grammar: `<Plot>` with mark children.** `<Plot data={rows} x="month"><Bar y="revenue" /><Line y="target" /><Axis y format={currency('$')} /><Tip /><Legend /></Plot>` — channels are FIELD NAMES (typed `keyof T`) or accessors, marks are JSX children (so layering is composition and a `<Show>` around a mark is ordinary Pyreon), and `<Rule>` / `<Axis>` / `<Tip>` / `<Legend>` / `<Zoom>` declare annotations, axes, the tooltip, the legend and zoom/navigator/presets/brush/linking as data. Marks are branded components `<Plot>` scans structurally (the `Switch`/`Match` precedent) and resolves into the `marks={[bars(…)]}` props `<PlotChart>` already takes — the array form stays the config form and the two are one spec. A `color` channel on `<Plot>` pivots long-format rows into one series per distinct value (categories from `x`, gaps where a pair is absent, bars grouped unless `stack`). `resolveGrammar` and `channel` are exported. (50a5cea)

  Native: the compiler desugars `<Plot>` to the `<PlotChart marks>` element the plot host lowers — the grammar form emits byte-identical Swift/Kotlin to the array form — while the runtime `color` pivot and a stray mark outside `<Plot>` warn by name.

- Graph family: `layoutGraph` (DETERMINISTIC force layout — seeded PRNG, Fruchterman–Reingold repulsion/attraction with gravity and cooling, symbols clamped inside the box; `circular` and `none` (data coordinates) layouts; symbol radius by value; category colours; unknown-endpoint links dropped BY NAME), `renderGraph` (links width-by-value under symbols, opt-in labels, entrance converging from the centre), `hitGraph`, `<GraphChart>` (reactive canvas host, `onSelect(node)`, accessible table), `graphToSvg` (server-safe), and the option facade maps `type: 'graph'` (`data`/`nodes` with id/name/value/category/x/y, `links`/`edges` by name or index, `categories`, `layout`, `symbolSize`, `force.repulsion/edgeLength/gravity`, `label.show`; a `symbolSize` FUNCTION warns). Conformance corpus 22 → 23, floor 20 → 21. (5346f90)
- `<OptionChart>` honours a single `grid`'s position and the legend's placement, as ECharts does. (896d747)

  - `grid.left`, `top`, `right`, `bottom`, `width` and `height` (pixels or percent) fix the plot rect, and the axis labels draw in the margin. With a grid that sets `top`, the title and legend overlay the chart instead of pushing it down. The engine gains optional plot insets on `ChartSpec` (`gridLeft`, `gridTop`, `gridRight`, `gridBottom`).
  - The legend now sits top-centre by default (ECharts' default; it was top-left). It reads `orient`, `left`/`right`/`top`/`bottom` (keywords, pixels, percents), `itemGap`, `textStyle` colour and size, and `formatter`. Where no grid places the plot, a bottom or right-hand legend takes its band off the chart, like the top legend always did.
  - A multi-grid option no longer applies a grid's position twice inside its part.

- `<CandlestickChart>`: open/high/low/close per period, direction by color (7772578)
  (close vs open), a doji keeping a visible 1px body, the wick under the body.
  Geometry (`renderCandles`, `ohlcExtent`) exported standalone.

  `<HeatmapChart>`: two categorical axes, a value per cell, color as the third
  channel. First-seen category order (weekday names carry an order sorting
  destroys), duplicate observations sum, absent cells stay undrawn — absence
  and zero are different facts. The `#rrggbb` ramp interpolation is hand-rolled
  so the same code lowers to native, and the geometry (`buildHeatGrid`,
  `colorRamp`, `renderHeat`) is exported standalone like the rest of the
  engine.

- Stacked and grouped bars now render on the HORIZONTAL frame. (8be3273)

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

- Horizontal bars: `<PlotChart horizontal>` puts categories on the Y axis with (185739d)
  the left gutter sized by the widest category label (long names are the reason
  horizontal bars exist), grows bars rightward from the zero line — negative
  values leftward, the entrance animation included — and keeps the value
  formatter on the X axis. Bar marks only; non-bar marks are skipped rather
  than drawn as a misleading transpose. `chartToSvg` takes the same option.
- Add once-only hosted chart commands, configurable JSON-safe event forwarding, reactive loading state, and trusted pre-initialization registration to `ChartWebView`. (f2b1d43)
- `@pyreon/charts/plot`: every family host gets the interaction stack `<PlotChart>` had alone, and the hosts stop re-laying out on every pointer move. (6f79b9d)

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

- `<PlotChart>` host wave: keyboard navigation (the canvas is focusable; Left/Right/Up/Down move a focus datum drawn with a focus ring and announced in a polite live region, Home/End jump, Enter/Space fire `onSelect`, Escape clears — on by default, `keyboard={false}` opts out), update animation (a data change of the same shape tweens from the previous frame to the new one through the pure `tweenValues` helper, `updateAnimation`/`updateDuration`, reduced-motion aware), and `zoomPresets` (Highcharts-style range-selector buttons under the plot that set the dataZoom window to the last N rows). The canvas exposes `data-pyreon-zoom` and `data-pyreon-presets` as stable hooks. (6ea2c9c)
- The technical indicators are now `<Chart>` marks: `<Sma y window>`, `<Ema y window>`, `<Trend y>` and `<Bollinger y window k>` (a filled envelope `k` standard deviations wide, 2 by default, plus its middle line). They draw exactly what the array form's `sma`, `ema`, `trend` and `...bollinger` factories draw. Under a `color` pivot each series gets its own indicator over its own column. A mark with no `window` is skipped with a dev warning. (d5a7c06)

  Each indicator component carries its own factory, so a `<Chart>` without one does not bundle the indicator arithmetic. The resolver code shared by all indicators adds about 0.2 KB gzipped to `<Chart>` + `<Line>` (43.9 KB to 44.1 KB).

  On iOS and Android the compiler desugars the tags to the same `sma` / `ema` / `trend` / `...bollinger` calls, and the emit is byte-identical to the array form when `window` and `k` are numeric literals. The charts import migration lists the new names.

- Gaps and technical indicators. A non-finite series value is now a GAP: lines and areas break into runs at the gap (ECharts' `connectNulls: false`), points draw nothing there, and derived domains ignore it — the option facade maps `null` and `'-'` data to gaps silently instead of zeroing with a warning. `Mark.transform` derives a whole series from the resolved values, and `sma`, `ema`, `bollinger` (three marks: upper/middle/lower) and `trend` (least squares) ship as line marks whose warm-up positions are gaps, so an indicator starts where it is defined. Pure, Double-only math — lowers to native. (c50c972)
- Interaction wave for the plot engine: legend entries are now click-to-toggle (on by default with `showLegend`, opt out with `legendToggle: false`) — the domain rescales to the visible series, hidden entries render muted at their own hue, and the accessible table keeps every series because hiding is a visual focus tool, not a data edit. New `crosshair` prop draws a dashed rule through the hovered datum's column with a marker on each visible line/area/points series. `renderLegend` returns per-entry hit `boxes` and honours a `muted` flag on entries. (78e6bd0)
- Several charts in one ECharts option now render, as they do in ECharts. (3a56d34)

  The option facade used to route on `series[0]` and draw one series for most
  families, dropping the rest with a warning. `planOption` now splits an option
  into layers (`splitLayers`, a new `layers` plan kind): the cartesian series
  over the whole box (several grids still split inside it), series that share a
  coordinate system together (radar, polar, geo, single axis, parallel,
  calendar), and every other family series as its own layer, placed by its
  `center` / `radius` (pie, gauge, sunburst, chord) or its `left` / `top` /
  `right` / `bottom` / `width` / `height` box with ECharts' defaults. Two pies
  side by side, a pie in the corner of a line chart, a gauge beside a radar all
  draw.

  `<OptionChart>` paints the cartesian part on its canvas and mounts each family
  layer's own interactive host over it, in its box and without a background;
  a layer of unchanged shape stays mounted across updates, so it tweens. A
  multi-grid option with a family series on one grid (candlesticks over volume
  bars) now takes the same path instead of falling back to static SVG.
  `optionToSvg` composes the layers into one document. A multi-grid option's
  `backgroundColor` now covers the whole canvas.

  Still open: a family series sharing ONE grid with line or bar series
  (candles with moving-average lines on the same axes), and native
  `<OptionChart>`, which lowers `series[0]` only.

- The chart capability ledger can no longer claim more than it proves. (d3fa2c6)

  `CHART_CAPABILITIES` rows now carry a status per target (`web`, `ios`,
  `android`), a `gaps` list saying why a target falls short, and evidence that
  must be a test. `chartCapabilityScore(mode, target?)` scores one target or all
  three, and reports `partial` and `pending` counts. Every "unsupported"
  warning in the option facade is tagged with the row it belongs to, and a
  tagged row cannot be complete; the native compiler holds the same rule for
  the props its hosts drop. Seven rows were added (key totality, multi-series,
  axis pointer, media, keyboard, accessible table, split hosted rows).

  The honest score is lower than the old one. The direct option contract is
  complete for 32 of 68 rows on the web and for 1 of 68 natively, where an
  `<OptionChart>` option still has to be a compile-time literal. The previous
  ledger reported 100.

  `echarts` is now an optional peer: `@pyreon/charts/plot` never imports it.
  `pyreon doctor`'s doc-claims gate checks the chart host counts.

- OptionChart and optionToSvg now lay the legend out the way ECharts 6 does. (896d747)

  - **Icons:** each entry draws its series' icon. That is a 25 × 14 rounded rect, a line with its symbol for a line series, or the symbol for a scatter series. `legend.icon`, per-item `icon` and a series' `legendIcon` override it.
  - **Items:** the name sits 5 px after the icon. Entries are 8 px apart and wrap at the available width (ECharts' `boxLayout`, icon bounds included). The legend reads `itemWidth`, `itemHeight`, `itemGap`, `padding`, `align`, `inactiveColor`, `backgroundColor` and borders.
  - **Placement:** the block sits centred 15 px above the bottom, inside a 5 px padding.
  - **Space:** a legend in the top half reserves room above the plot, and one in the bottom half below it.

  Checked against ECharts' own SSR output.

- Legend PLACEMENT crosses to native — `legendPosition` lowers, and an 8px divergence closes (81e52fb)

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

- Scrollable legend + title block. `renderLegend` gains `maxRows` and `page`: a legend that overflows the cap shows `maxRows` rows and a right-aligned pager (prev / current-of-total / next) whose arrows come back as hit rects in `LegendLayout.pager`; the second layout pass reserves the pager's width so the last visible row never runs under it, entries on other pages are not drawn and keep an EMPTY hit rect (w = -1) so `boxes` stays index-aligned, and an uncapped legend renders byte-identically to before. New `renderTitle(text, subtitle, box, opts)` lays out a title and optional sub-title block (start/middle/end alignment) and reports the height it consumed — the legend's contract — so a host shrinks the plot by exactly what was drawn. (b57c99f)
- `lines` series in the option facade (cartesian): each datum's `coords` (or a bare `[[x, y], …]` array) becomes a polyline through the chart's pixel api, with `lineStyle.width` / `color` at series or datum level, axes seeded from every vertex; a datum without coords warns by index, and `effect` (animated trails) warns by name. Lowered as an internal custom plan, so `customCommands` serves hosts. Conformance corpus 32 → 33, floor 30 → 31. (fea7fde)
- Linked charts (ECharts `connect`): `createChartLink()` returns a shared `{ zoom, hover }` pair; pass it as `<PlotChart link>` to every chart in a group and wheel-zoom, pan, navigator drags, presets and the crosshair datum stay in sync across all of them. The host exposes `data-pyreon-hover` beside `data-pyreon-zoom`. (6ea2c9c)
- Map family: `registerMap` / `getMap` / `listMaps` (ECharts' registry shape over GeoJSON FeatureCollections), `projectLonLat` (equirectangular or Mercator with polar clamping), `layoutGeo` (Polygon + MultiPolygon outer rings projected and fitted into a box with aspect preserved, north up, area-weighted centroids, per-region bboxes, a reusable `project` for overlays), `geoDomain`, `renderGeo` (fills through the shared heat ramp with a data or `visualMap` domain, an empty colour for regions without data, borders, labels only where they fit, fade-in entrance), `hitGeo` (bbox then point-in-ring), `<MapChart>` (reactive canvas host over a GeoJSON or a registered name, `onSelect(region)`, accessible table), `geoToSvg` (server-safe), and the option facade maps `type: 'map'` (`map` name, `{ name, value }` data, `visualMap`, `label.show`, `itemStyle.borderColor/Width`, `nameProperty`; an unregistered map and `roam` warn by name). Conformance corpus 34 → 35, floor 32 → 33. (fea7fde)
- `markLine` / `markPoint` reach the engine in every ECharts spelling: `median` rules, point-to-point `[from, to]` pairs (statistics, `coord`s or `xAxis` + `yAxis` pairs), `average` points (the datum nearest the mean), category-named `coord`s, `value` labels, per-mark `lineStyle` / `itemStyle` colours and `symbolSize`. The engine's `Annotation` gains a segment form (`x1` / `y1` / `x2` / `y2`) and `PointMarker.at` accepts `'average'`. (f2b1d43)
- Datum-anchored point markers — ECharts' markPoint, engine-shaped. `ChartSpec.markers` / `ChartToSvgOptions.markers` take `PointMarker[]`: anchor at a series' `'max'`/`'min'` or a concrete `atIndex` (clamped), with label above the point, colour/radius defaulting to the series' own. Markers draw OVER the series in painter's order, grow with the entrance `progress`, scale against the series' OWN axis (a right-axis series marks on the right domain), and skip joint layouts (stacked/grouped) and the horizontal frame rather than guessing — a marker with no anchor is skipped, the Annotation precedent. The anchor is split into two fields (`at` + `atIndex`) rather than one mixed string/number union deliberately: the split keeps the engine inside the native-compilable subset at zero caller cost. (7da8b03)
- Every native chart canvas is now NAMED, and the plot host is DESCRIBED from its own data. (9f271ae)

  A canvas is one opaque node to a screen reader. The web hosts have always answered that with the engine's `describeChart` sentence as the `aria-label` plus an offscreen table; natively only a `title` was ever applied — so an untitled chart was a blank rectangle to VoiceOver and TalkBack, and a titled one said its title and nothing about its data.

  - `a11y.ts` crosses with the engine (`ENGINE_FILES`), so `describeChart` / `chartTable` are generated into `PyreonChartEngine.swift` / `.kt` and both targets read the SAME sentence the web does. Its two subscript reads are bounds-checked for the native subset (a Swift subscript is never optional), which also fixes a real web edge: a series longer than the categories, or shorter than its siblings, now renders an empty cell instead of reading past the end.
  - Both emitters apply the label in the web host's order of precedence: an explicit `accessibilityLabel`, else the data description (the plot host, built from the series and categories the canvas painted and through the chart's own `format`), else `title`, else the family word (`chartDefaultLabel`: `PieChart` → "Pie chart", `PlotChart` → "Chart"). The description is emitted INSIDE the scope holding the hoisted series, which is the only place those bindings exist.
  - Device-asserted on both platforms: the tasks showcase's bar chart is queried for its label / content description and must carry the title, the series and the category count.

- `<PlotChart brush onBrush>` lowers natively — the last gesture surface. `brush.ts` is now a crossing engine module (`brushRange`: a pixel span → a GLOBAL inclusive datum range under the window; `brushBand`: where a committed range sits on the plot through the window; `renderBrushBand`: the translucent band with dashed edges) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android a plain drag on the plot selects (the web's rule without `dataZoom`), the band is drawn inside the chrome wrap, a plain tap clears the selection, and a NAMED `onBrush` handler receives `BrushRange | null`. With `dataZoom` on, the web brushes on Shift+drag, which touch does not have, so that one combination stays web-only and warns by name; an inline `onBrush` arrow warns by name too (the brush still selects). `@pyreon/charts/plot` also exports `brushBand`, `renderBrushBand` and the `BrushRange` / `BrushBand` types. (e6ef4e3)
- **Native chrome parity for the family hosts.** `showTitle` / `subtitle`, `showLegend` and `tooltip` now lower on every generic and accessor host (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, funnel, pie) on both native targets — not only on the plot host. The legend's entries and the tooltip's lines come from ONE crossing module, `chrome.ts` (`treemapLegend`, `sankeyTip`, `pieTip`, … plus `renderTooltip`, which draws the box into the draw list), and the web canvas host now calls the same functions, so what a legend lists and what a tap says agree by construction. On native a tap shows the tooltip and a tap on nothing dismisses it; a host with a tap lays out ONCE (the paint and the hit used to compute the layout twice). `animate` is the one chrome prop still named as unlowered. (50a5cea)

  PMTC: an annotated local (`const e: LegendEntry = { … }`) steers its object literal to the named struct — the field set alone picked a same-shaped sibling (`Slice` for a `TooltipRow`) or, with an optional field omitted, no struct at all (a tuple); `readonly T[]` / `ReadonlyArray<T>` lower like `T[]`; `keyof` / `unique` warn by name.

- `<PlotChart dataZoom>` lowers to native: a pinch (SwiftUI `MagnificationGesture`, Compose `detectTransformGestures`) and a pan drive the engine's fraction window (`zoomWindow` / `panWindow`), the rows are sliced through `sliceRange`, accessors keep their GLOBAL index and `onSelect` reports global indices. `zoom.ts` is rewritten in the crossing subset (`sliceRange` returns a named `SliceRange` computed without `Math.floor` / `Math.ceil`) and crosses into the generated engine; `brushRange` moves to `./brush` (web). The Swift emitter gains a host-state splice: an expression host can register `@State` properties on its component. (8d1ff30)
- Calendar geometry joins the generated native chart engine. `layoutCalendar` / `renderCalendar` / `calendarDomain` / `hitCalendarIndex` are rewritten Date-free (proleptic-Gregorian civil arithmetic in exact Doubles: `daysFromCivil`, `civilFromDays`, `weekdayOfDays`, `parseIsoDays`, `formatIsoDays` — all new exports) and bundled into `PyreonChartEngine.swift` / `.kt`. BREAKING for direct engine callers: `calendarDomain` and `renderCalendar` take a `CalendarValue[]` (`{ date, value }`) instead of a record — wrap a record with the new `calendarValues(record)`; `calendarDomain` returns a `Domain` (`{ min, max }`) and `CalendarOptions.domain` is a `Domain`, not a tuple; `CalendarLayout` gains `startDay` / `days`. `parseIsoDate` / `formatIsoDate` (epoch ms) and the nullable `hitCalendar` move to `engine/calendar-web.ts`, `calendarToSvg` to `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<CalendarChart values={record}>` are unchanged. (8d1ff30)
- The funnel family's geometry (`layoutFunnel` / `renderFunnel` / `hitFunnel`) joins the generated native chart engine — one TypeScript source, compiled by PMTC into `PyreonChartEngine.swift` / `.kt`, so a funnel lays out identically on iOS and Android. `funnelToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`). (61fea37)
- Gantt geometry joins the generated native chart engine, built on the calendar family's Date-free civil arithmetic. BREAKING (pre-1.0, clean API): time is DAYS since 1970-01-01 everywhere — `GanttTask.start` / `end` and `GanttOptions.today` are ISO `YYYY-MM-DD` strings only (epoch-ms values and the `Date.parse` fallback are gone; convert with `formatIsoDate`), `GanttOptions.domain` is a `GanttRange` (`{ start, end }`, ISO) instead of a tuple, `GanttLayout.domain` is a `Domain` (`{ min, max }` in days), `GanttRow.startMs` / `endMs` become `startDay` / `endDay`, `GanttRow.label` is the name string with `labelAt` beside it, and `GanttLayout.today` becomes `hasToday` + `todayX`. `ganttTicks` takes and returns days (`GanttTick[]`, `x` filled by the layout). The engine answers hits as an index (`hitGanttIndex`); the nullable `hitGantt` lives in `engine/gantt-web.ts` and `ganttToSvg` in `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<GanttChart>` are unchanged. (8d1ff30)
- Graph geometry joins the generated native chart engine. `layoutGraph` / `renderGraph` are rewritten in the PMTC subset and bundled into `PyreonChartEngine.swift` / `.kt`. The force layout's PRNG is now a Park–Miller LCG in exact Double arithmetic (`graphNextSeed`, exported) instead of mulberry32 — still deterministic per `seed`, but a given seed produces a DIFFERENT arrangement than before. The engine answers hits as an INDEX (`hitGraphIndex`, -1 for none); the web-facing nullable `hitGraph` lives in `graph-hit.ts` and `graphToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderGraph` no longer takes a measurer. `GraphLayoutLink` gains `index` (position among the kept links) and `GraphLayout` gains `mode` (the layout that ran) — additive, and what keeps the crossed structs distinct from sankey's. (8d1ff30)
- Heatmap and candlestick geometry join the generated native chart engine. `buildHeatGrid` / `renderHeat` / `hitHeatCell` and `ohlcExtent` / `renderCandles` / `hitCandle` are bundled into `PyreonChartEngine.swift` / `.kt`. The colour ramp is now a plain function, `rampColor(stops, t)` (new export); `HeatmapOptions.ramp` (a closure) is REPLACED by `stops?: string[]` (default `HEAT_RAMP`), and the closure factory `colorRamp(stops)` moves to `engine/heat-ramp.ts` (still exported from `@pyreon/charts/plot`, built on `rampColor`). `renderCandles`' options parameter is optional instead of defaulting to `{}`; `hitCandle` is now exported from `/plot`. (8d1ff30)
- Parallel coordinates join the generated native chart engine — the last chart family to cross. BREAKING (pre-1.0, clean API): the engine takes NUMERIC rows (`Double[][]`; a category as its index in the axis's `categories`, a gap as `NaN`) — the web `ParallelRow` (`(number | string | null)[]`) is converted with the new `parallelRows(axes, rows)` (`<ParallelChart>`, `parallelToSvg` and the ECharts facade do this for you); `ParallelAxis.domain` and `ParallelLayoutAxis.domain` are `Domain` structs; the per-axis `place` closure is the function `parallelPlace(axis, value)` → `{ ok, y }`; `ParallelLine.points` is `Pt[]` with a parallel `present: boolean[]` (a gap is an absent point, not `null`) and `lineRuns(points, present)` matches; `ParallelOptions.lineColor` is a string only, with the per-row callback expressed as `lineColors: string[]` (`parallelLineColors(rows, fn)`, or `<ParallelChart rowColor={fn}>`). `hitParallelIndex` is the engine's hit; the nullable `hitParallel`, `parallelRows`, `parallelLineColors` and `lineRuns` live in `engine/parallel-web.ts`; `parallelToSvg` in `family-svg.ts`. The `@pyreon/charts/plot` re-exports are unchanged. (8d1ff30)
- Polar geometry (`layoutPolar` / `renderPolar` / `hitPolarIndex` / `polarTicks`) joins the generated native chart engine. The engine's hit answers indices (`PolarHitIndex`); the web-facing `hitPolar` + `PolarHit` union live in `polar-hit.ts`; `PolarLayout.lines` / `categoryLabels` / `ticks` are the named `PolarLine` / `PolarCategoryLabel` / `PolarTick`; `renderPolar` drops its unused measurer; `polarToSvg` moved to `family-svg.ts` (all still exported from `@pyreon/charts/plot`). (61fea37)
- Sankey geometry joins the generated native chart engine. `layoutSankey` / `renderSankey` / `ribbonPoints` are rewritten in the PMTC subset (name lookups are scans, the relaxation stack/resolve steps are inlined, comparator sorts are insertion sorts, no `Infinity`) and bundled into `PyreonChartEngine.swift` / `.kt`. The engine answers hits as INDICES (`hitSankeyIndex` → `{ node, link }`); the web-facing `hitSankey` union lives in `sankey-hit.ts` and `sankeyToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderSankey` no longer takes a measurer (labels do not need one). (61fea37)
- Tree and theme-river geometry (`layoutTree` / `renderTree` / `hitTree` / `linkPoints`, `layoutRiver` / `renderRiver` / `hitRiver` / `smoothPoints` / `layerPolygon`) join the generated native chart engine. `TreeLink` carries the entered node's `depth`; `RiverLayout.ticks` is a named `RiverTick`; `renderTree` drops its unused measurer parameter; `treeToSvg` / `riverToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`). (61fea37)
- Treemap and sunburst geometry (`layoutTreemap` / `renderTreemap` / `hitTreemap`, `layoutSunburst` / `renderSunburst` / `hitSunburst`, `nodeValue`, `treeDepth`, `tintHex`) join the generated native chart engine — squarify and the radial partition run from one TypeScript source on iOS and Android. `treemapToSvg` / `sunburstToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`). (61fea37)
- The entrance animation crosses. On the web, `animate` was wired on `<PlotChart>` only: the fourteen canvas-host families (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, parallel, funnel, map, boxplot, heatmap) took the prop and never passed the tween's progress to their engine, so they painted fully formed. Each now declares `animates` and hands `progress` to its render (`renderHeatChart` takes it as an optional trailing argument). Natively, both emitters render every host whose engine takes a `progress` — the same set — inside a new `PyreonChartEntrance` runtime view (SwiftUI `TimelineView`, paused once the tween ends; a Compose `Animatable`), which hands the cubic ease-out progress into `ChartSpec.progress`, into a copy of the host's `XOptions`, or as the heatmap wrapper's argument, over `theme.enterMs`; Reduce Motion on iOS and a zero animator scale on Android render at once, like `prefers-reduced-motion`. `animate={false}` emits the host exactly as before. An engine with no entrance (Pie, Radar, Candlestick, Gauge) now names `animate` as inert on every target instead of "not lowered on native". (50a5cea)

  Two fixes the copy exposed: an inline options literal (`tree={{ symbolSize: 8 }}`) lowered to a synthesized `__Obj0` that swiftc rejected against `TreeOptions` — it is steered to the engine struct now — and a non-nil options value was read with optional chaining in the tooltip and hit paths, an error on a non-optional in Swift.

- The candlestick and heatmap frames move into the engine — `candlestickFrame` / `renderCandlestickChart` / `hitCandlestickChart` and `heatGridFrom` / `heatPlotFor` / `renderHeatChart` / `hitHeatChart` (exported from `@pyreon/charts/plot`) — so the web hosts and the native canvas paint the SAME command list; both modules cross into the generated native engine. The native runtimes gain `pyreonChartMeasure` (UIKit / `Paint` text width in engine units), the measurer a laid-out frame needs. `<CandlestickChart>`, `<HeatmapChart>` and `<RadarChart>` lower to native (accessor bodies inlined; a `theme` override, a cell-shaped heatmap `onSelect` and `showLegend` warn by name). (8d1ff30)
- Compile the public hosted-chart component to real iOS and Android webviews, preserve reactive options, commands and loading state, and route selection, event and failure messages with matching semantics on every target. Add vendor-neutral host bundle aliases while retaining existing compatibility props. (f2b1d43)
- `onSelectIndex` — selection on the family hosts in the form that crosses to native. Every lowered host (`<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`) takes `onSelectIndex`, which receives the engine's INDEX hit (`SankeyHitIndex` `{ node, link }`, `PolarHitIndex`, or a plain index with -1 for a miss) beside the web-shaped `onSelect`. On the web it fires from the same click; on iOS/Android the compiler lowers it to a tap gesture (`DragGesture(minimumDistance: 0)` / `detectTapGestures`) that hit-tests the same layout the canvas painted — the tap position divided by the display density on Android, where the draw list is laid out in dp. New engine exports `hitTreemapIndex`, `hitSunburstIndex`, `hitTreeIndex`, `hitRiverIndex` (the existing object-returning hits now wrap them); `@pyreon/native-cli` adds the `detectTapGestures` / `LocalDensity` Kotlin imports when the emit uses them. (8d1ff30)
- `sma`, `ema` and `trend` lower to iOS and Android (d4e3a2f)

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

- The legend and title blocks draw natively. `renderLegend` is rewritten in the crossing subset (`legendPlan` is a named top-level plan; `LegendPager.prev` / `next` are plain rects guarded by `hasPrev` / `hasNext` instead of `Rect | null`; the page label goes through `plain`), and it crosses into the generated engine together with `renderTitle`. The native runtimes gain `pyreonShiftCmds(cmds, dy)` — the web hosts' `shiftCmd`, which sits the plot below the chrome. `<PlotChart showLegend showTitle subtitle legendMaxRows>`, `<PieChart showLegend>` and `<RadarChart showLegend>` now emit the title block, the legend, and the plot translated down by both, with the tap offset to match; a host without the flags emits exactly what it did before. (8d1ff30)
- `<PlotChart showLegend>`'s legend tap toggle and paging lower natively. The toggle rule is now an engine module (`legend-toggle.ts`: `legendToggle` / `hideHiddenSeries` / `legendHitIndex` / `pagerHit`) that the web host consumes — a hidden series keeps its slot, stacked/grouped series are zeroed rather than emptied, exactly as before — and that generates into `PyreonChartEngine.swift/.kt`. On native the hidden set and the legend page are host state; a tap on an entry toggles it, the entries render muted, `legendMaxRows` pages through the pager arrows, and a tap is resolved pager → entry → preset → selection, the web's order. `legendToggle={false}` keeps the legend inert on every target. (e6ef4e3)
- `<PlotChart navigator>` — the slider dataZoom — lowers natively. The strip is now an engine module (`navigator.ts`: `renderNavigator` over the first series across every row, `navigatorHit` for what a press grabs — band, left or right handle — and `navigatorDrag` for the window a drag produces) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android the drag rides a dedicated overlay above the strip (a clear SwiftUI layer / a Compose Box with `detectDragGestures`), so it never competes with the plot's pinch and pan, and it writes the same host window the pinch, the presets and the row slice read. The Android build now imports `detectDragGestures` (and `detectTransformGestures` for the pinch) for the real Gradle build — both live outside the star-imported packages and the stub gate could not see them missing. (e6ef4e3)
- `@pyreon/charts/plot` on iOS/Android — the native side of the host-parity audit. (0295aaa)

  - **A bare host follows the runtime colour scheme.** With no `theme` and no `<ChartThemeProvider>`, a chart on the web follows `prefers-color-scheme`; on a phone it was hard-wired to the light theme, silently. Every field the two built-in themes disagree on now lowers to a runtime conditional over SwiftUI's `colorScheme` environment / Compose's `isSystemInDarkTheme()`; sizes and timings stay literals; a named theme or a provider scope pins it as before.
  - **`<BoxplotChart>` crosses**: its `fiveNumber` reduction and the whole frame (`boxplot-chart.ts`) are generated into both engines; the host lowers with an entrance, a tap per band and the theme. `boxplotToSvg` moves to `boxplot-svg.ts` (same export from `/plot`); `boxplotFrame` / `renderBoxplotChart` / `hitBoxplotChart` are exported.
  - **`<RadarChart>` gets a tap on both targets** (`onSelect` / `onSelectIndex` receive the engine's `{ series, axis }` hit) — it had none on either.
  - **What does not cross says so**: a rich-hit `onSelect` on the eleven table-driven hosts warns and names `onSelectIndex` (it vanished); `<ParallelChart tooltip>` warns (the policy claimed it lowered); `<MapChart>` declines by name instead of falling into the generic component emit as a symbol no target has.
  - The Kotlin frame hosts (Heatmap, Candlestick, Boxplot, Radar) key their tap on the vals it captures, so a tap after a data change resolves against the current geometry (`pointerInput(Unit)` kept the first composition's).
  - Device assertions in the tasks showcase on both platforms: a tap on the radar's first vertex reports series 0 / axis 0, a tap per boxplot band reports its index.

- `<PlotChart marks>` — the cartesian family — lowers to native. Each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points`, literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `renderChart` paints it; `onSelect` taps the new engine `plotHitBars`, which the web host's click now uses too (`plotHitIndex` for its tooltip), exported from `@pyreon/charts/plot` and crossing into the native engine. A `bubble` mark, a `curve` option, the legend / title / zoom / brush / navigator surfaces, formatters and a `theme` override warn by name. (8d1ff30)
- The remaining `<PlotChart>` inputs lower to native: a literal `theme={{ … }}` merges over the default theme (Candlestick and Heatmap hosts too); `format` / `xFormat` / `y2Format` lower as the engine's formatter by name (`compact`), a factory call (`fixed(1)`, `currency`, `percent`) or a closure; a `bubble` mark carries area-mapped radii through the new engine `bubbleRadii` (which `resolveMarks` now uses on the web). What still warns by name on native: `dataZoom`, `brush`, `navigator`, `zoomPresets`. (8d1ff30)
- Engine: `formatTime` is now pure UTC epoch math (civil-from-days) instead of local-time `Date` getters — one shared source labels the same timestamp identically on web, iOS and Android, and the function lowers under PMTC (`new Date` is a class-construction bail). This changes default time-axis labels from device-local time to UTC; a locale/zone-aware label remains a `Formatter` the caller supplies. Also: `timeTicks` binds its formatter coalesce-first (an optional closure call does not narrow through a ternary in Swift), `fitCircle` returns a NAMED `Circle` type (an inline object return annotation lowers to a mismatched tuple), and locals that shadowed `Math.max`/`Math.min` call names are renamed (Swift scoping rejects the shadow JS allows). (c6b2fb6)
- Resolve static timeline steps for native `OptionChart` output and preserve nested configuration when timeline steps merge on every renderer, including indexed series merging and explicit diagnostics for invalid steps. (f2b1d43)
- A series the option did not name no longer shows its generated "Series 1" in the default tooltip, on web and native. ECharts hides it: an item tooltip has no header, and an axis row has no name. A browser differential against real ECharts covers both cases, and the default trigger (item). (896d747)

  On iOS and Android, an OptionChart bar, line or scatter chart and a funnel now show ECharts' default tooltip rows, as the pie already did. An item tooltip, the default trigger, shows the series under the tap. An axis tooltip shows a row per series. The new engine functions are `tooltipAxisCells`, `tooltipItemCells` and `funnelTipRowsWith`. A formatted tooltip keeps the plain lines, since native runs no formatter function.

- `<PlotChart zoomPresets>` lowers natively. The preset strip is now an engine module (`presets.ts`: `renderPresets` / `presetHit` / `presetWindow` / `presetIsActive`) that the web host consumes — the strip it paints is byte-identical — and that generates into `PyreonChartEngine.swift/.kt`, so iOS and Android lay out and hit-test the same buttons. On native a tap on a preset writes the host's window (re-anchoring an active pinch when `dataZoom` is on too); presets bring the window state with them even without `dataZoom`. A non-literal `zoomPresets` value warns by name and renders the chart without the strip. (8d1ff30)
- `<PlotChart navigator>` — the slider dataZoom: a strip under the plot shows the first series over ALL rows with the zoom window as a band; drag the band to move the window, drag a handle to resize it (window math shared with the wheel/pan zoom, minimum span enforced). Works with or without the inside `dataZoom`; the strip rect is exposed as `data-pyreon-nav`. (6ea2c9c)
- Numbers read as ECharts shows them: axis ticks, tooltips, the spoken description and the accessible table now group thousands by default (`60,000`, not `60000`), matching ECharts' `addCommas`. `currency('$')` groups too (`$60,000`). Series value labels are unchanged, since ECharts' `{c}` shows the raw value, and an explicit `format` still wins everywhere. `<OptionChart>` already grouped its axis; `<Chart>` now agrees with it. (d5a7c06)

  A `<Band>`, and the envelope of `<Bollinger>`, now fills translucently by default (opacity 0.3, as `<Area>` does) instead of opaquely in the palette colour, which hid the lines drawn over it. `areaOpacity` sets it.

  The generated Swift and Kotlin chart engines are regenerated, so iOS and Android show the same numbers.

- **Breaking:** `<Chart>` has one selection callback, `<Tip>` is `<Tooltip>`, and the pie, funnel, heatmap and candlestick are marks. (d5a7c06)

  - `<Chart onSelect={(i) => …}>` receives the index of the drawn item on the web, iOS and Android: the row for the cartesian marks, `<Arc>`, `<Stage>` and `<Candle>`, and the cell for `<Cell>`. `<Chart onSelectIndex>` is removed. Over `<Cell>`, `onSelect` used to receive the heatmap host's cell object on the web and could not lower on native; it is now the cell index everywhere.
  - `<Tip>` is renamed `<Tooltip>` (`TipProps` → `TooltipProps`).
  - `PieChart`, `FunnelChart`, `HeatmapChart` and `CandlestickChart` leave the main entry for `@pyreon/charts/engine`. Write `<Chart data><Arc value label /></Chart>`, `<Stage>`, `<Cell>` or `<Candle>` instead. The family components with no row-per-datum shape (gauge, radar, treemap, sankey, …) stay in the main entry.

- `<Chart>` bundles only the interactions and hosts its children use. (d5a7c06)

  - **`<Toolbox>` replaces `<Chart toolbox={…}>`** (breaking). The child takes the same config: `<Toolbox saveAsImage restore magicType={['line', 'bar']} />`.
  - `<Zoom>` carries the navigator, presets and range brush, and `<Toolbox>` carries the tool strip, SVG save, magic type and area brushes. A chart without them references none of that code.
  - Every cartesian mark carries the plot host. A family-only chart, such as a pie through `<Arc>`, no longer bundles the cartesian plot.

  Measured on the built main entry, gzipped: `<Chart>` + `<Line>` drops from 47.8 KB to 43.8 KB, and `<Chart>` + `<Arc>` from 52.7 KB to 24.5 KB. `<PlotChart>` (`/engine`) is unchanged and still carries every feature. On native, `<Toolbox>` desugars to the `toolbox` config the host already lowers, and the emit is identical to `<PlotChart toolbox>`.

- `<OptionChart>` mounts a family option (pie, gauge, radar, candlestick, heatmap, funnel, treemap, sunburst, tree, sankey, graph, calendar, parallel, polar, themeRiver, map) on the family's OWN canvas host — hit-testing, reactive repaint and the accessible table included — via the new `familyHostNode(plan, { width, height, onSelect })`; the host's hit arrives on `onFamilySelect(kind, hit)`. Only the two host-less shapes (geo points, single axis) still render as SVG. (61fea37)
- `<OptionChart option>` — the ECharts-option-driven reactive host: pass an ECharts-shaped option (value or accessor) and get a live canvas chart with click hit-testing (`onSelect` → `{ seriesIndex, dataIndex, name, value }`), `theme` / `locale`, a driven or auto-playing `timeline` (`timelineIndex`, `onTimelineChange`), multi-`grid` composition, and the accessible table; family and geo options render through the same facade as SVG. `compiledCommands` (the composed picture of a compiled cartesian option as flat commands) is exported so `optionToSvg` and the host paint one geometry. (61fea37)
- ECharts option-compat facade. `compileOption(option)` accepts an ECharts-shaped option and compiles it onto the plot engine — bar / stacked / grouped / line / area / step / smooth / scatter series (number, `{value}` and `[x, y]` pair data), category / value / time x axes, one or two y axes (`yAxisIndex: 1` → the right axis, `min`/`max` → pinned domains, function and `{value}`-template formatters), `markLine` (average/max/min, yAxis, xAxis) → annotations, `markPoint` (max/min, coord) → markers, `color` palette, `itemStyle`/`lineStyle` colours, `title`/`legend`/`tooltip` host hints. Nothing is dropped silently: every unmapped key, series option, series type or data shape becomes a named `OptionWarning` with a path, and an unmappable series flips `supported` to false. `optionToSvg(option)` composes title + legend + chart into a server-safe `<svg>` string. A gallery-shaped conformance corpus is the parity metric — its clean pass count is locked as a floor that only ratchets up. (7da8b03)
- The option facade's family half: pie (radius pair → donut hole, per-slice itemStyle colours, label.show, legend), gauge (min/max, detail.show, progress/itemStyle colour, axisLine width), radar (`radar.indicator` → axes, areaStyle opacity, multi-series), candlestick (ECharts' `[open, close, low, high]` tuples, itemStyle color/color0), heatmap (`[xIndex, yIndex, value]` triples over category axes, `visualMap.inRange.color` ramp). `planOption` routes any option to the right half; `optionToSvg` renders every family through the family SVG helpers. The conformance corpus grows to 17 gallery-shaped fixtures with a floor of 15 clean. (6f9eece)
- New `@pyreon/charts/option-layer` subpath: the ECharts dataset pipeline (`resolveDataset`, `readSource`, `applyTransforms`, the transform registry) as a pure module for consumers that resolve an option without rendering it — the native compiler runs it at compile time. (f2b1d43)
- Option-level layers for the ECharts facade: `resolveDataset` (the `dataset` pre-pass — array sources with auto/explicit `sourceHeader`, object sources, `dimensions`, `seriesLayoutBy: 'row'`, `encode` by name or index, `datasetIndex`; materialises category `xAxis.data` plus per-series data as values, `[x, y]` pairs for scatter, or `{ name, value }` items for the name-value families; never mutates the input; transforms warn by name) wired into BOTH facade halves, and `graphicCommands` (the `graphic` layer — text / rect / circle / line / polygon / polyline / group with `x`/`y`, `left`/`top`/`right`/`bottom`, percentages and `center`; unsupported types warn by name) appended above the chart in `optionToSvg` for cartesian and family options alike (`appendGraphicLayer` splices into a rendered `<svg>`). Conformance corpus 27 → 28, floor 25 → 26. (05f4b35)
- `<OptionChart>`'s legend is interactive, as in ECharts. A click on an entry hides every series of that name and a second click shows it again; a hidden series keeps its colour slot and draws, hits and tooltips nothing. `legend.selected` starts named series off, `legend.selectedMode` (`'single'`, `false`) changes what a click does, and `legend.data` picks and orders the entries. The new `onLegendSelectChange` prop reports every change, as ECharts' `legendselectchanged` does. Before, the option legend was a static picture. (896d747)
- `@pyreon/charts/plot` option facade: `sampling` (`lttb` / `average` / `max` / `min` / `sum`), `large` + `largeThreshold` and `progressive` + `progressiveThreshold` thin a large series to a bounded point count with every series and the category axis kept on the same rows; `<OptionChart optionUpdate>` accepts `setOption`'s own `notMerge`, `replaceMerge` (id-merge, drop unmatched), `lazyUpdate` and `silent`. (f2b1d43)
- ECharts facade: `timeline` (`baseOption` + `options[]` steps — series merged by index, a strip with one dot per step under the chart, `timelineIndex` to pick a step, out-of-range steps warn `timeline-step-out-of-range`) and multi-`grid` layouts (`gridRect` px/% parsing, axes and series assigned by `gridIndex`/`xAxisIndex`, one sub-chart per grid composed into ONE `<svg>`; `planOption` returns `{ kind: 'grids' }`). Pure functions in `option-composite.ts`. (6ea2c9c)
- `<OptionChart>` gains a `link` prop: charts given the same `createChartLink()` share one zoom window and one hovered datum, as ECharts' `echarts.connect` couples charts. Before, only `PlotChart` could be linked. The option title now reads `left`/`right`, `textAlign`, `textStyle` and `subtextStyle` colour and size, and `itemGap`. Before, it was always a left-aligned block in the theme colour. (896d747)
- Parallel-coordinates family: `layoutParallel` (evenly spaced vertical axes; value axes linear with data or fixed `domain` and `inverse`, category axes by position; nulls and unplaceable values become gaps; per-row or constant line colour), `lineRuns`, `renderParallel` (rows as translucent polylines, `highlight` rows drawn last and opaque, axes/ticks/names, left-to-right entrance), `hitParallel` (nearest segment within a tolerance), `<ParallelChart>` (reactive canvas host, `onSelect(line)`, accessible per-axis table), `parallelToSvg` (server-safe), and the option facade maps `parallelAxis` + `type: 'parallel'` (`dim`, `name`, `type: 'category'` + `data`, `min`/`max`, `inverse`, `lineStyle.width/opacity/color`; `parallel.layout: 'vertical'` warns). Conformance corpus 24 → 25, floor 22 → 23. (2930393)
- The plot engine's first parity wave: curves, annotations, bubbles, value (0f0cc85)
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

- Add backend-neutral repeating pattern fills for bar and area marks, rendered consistently by canvas, SVG, SwiftUI, and Compose. (f2b1d43)
- OptionChart and optionToSvg now draw a pie the way ECharts does. They read startAngle, endAngle, clockwise, minAngle, padAngle, roseType, stillShowZeroSum and the series' box keys. Labels are the slice names outside the pie on two-part guide lines, pushed apart so they never overlap and cut with an ellipsis when they would leave the chart. The pie also reads label.position, formatter, alignTo, edgeDistance, rotate, overflow and minShowLabelAngle, labelLine, avoidLabelOverlap, percentPrecision and the empty circle. The default radius is ECharts' 50% (chord 80%). All of this is checked against ECharts' own SSR output. The engine gains layoutArcsWith, ArcConfig and pie-labels, so the native engine carries the same maths. A hit on a pie now reports the slice's input index when a slice before it draws nothing. (896d747)
- New `@pyreon/charts/plot` — Pyreon's own charting engine, with no third-party (2d34a98)
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
  import { PlotChart, bars, line } from "@pyreon/charts/plot";

  <PlotChart
    data={() => sales()}
    x={(d) => d.month}
    marks={[
      bars((d) => d.revenue),
      line((d) => d.target, { color: "#b45309" }),
    ]}
    title="Monthly revenue"
    seriesLabels={["Revenue", "Target"]}
    height={240}
  />;
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

  The existing ECharts-backed `Chart` export is unchanged.

- `@pyreon/charts/plot` now exports the whole family set and the option facade: treemap / sunburst / tree (one `TreeNode` shape), sankey / graph, funnel / boxplot, calendar / parallel / polar / single axis / theme river / map + geo points and paths, the dataZoom window math and title block, `compileOption` / `optionToSvg` / `planOption` with the dataset, graphic, visualMap, custom-series, theme-registry and locale layers. Manifest entries (`TreemapChart`, `MapChart`, `optionToSvg`) feed the MCP reference; the Plot Engine docs page and README gain the family, coordinate and option-compat sections. (6ea2c9c)
- `PlotChart` gains the props the engine waves prepared: `y2Domain`/`y2Format` (right axis for marks with `axis: 'right'`; the crosshair places right-axis markers on their own domain), `markers` (datum-anchored point markers), `legendMaxRows` (paged legend with clickable prev/next arrows), `showTitle`/`subtitle` (a heading block that consumes height above the legend), and `tooltipFormatter` (replace the tooltip text from the resolved content). Also a correctness fix: pointer handlers now hit-test in PLOT space — the plot is drawn shifted below the title/legend, and hit rects were computed against the unshifted full-height layout, so with a legend shown a click just above a short bar reported a hit and a click inside a tall bar's upper part could miss. (7da8b03)
- Scatter and effectScatter series render on the polar coordinate (`PolarSeries.kind: 'scatter'`, `radius` from `symbolSize`): points at the line placement, circles only, hittable like line points — on web, iOS and Android. (f2b1d43)
- Polar coordinate: `layoutPolar` (categories on the ANGLE axis → radial bars in equal slots, grouped side by side or stacked along the radius, plus polar lines at slot centres; categories on the RADIUS axis → concentric arc bars sweeping by value; hole via `innerRatio`, `startAngle`, `clockwise`, fixed or data value domain, nice ticks), `renderPolar` (grid rings/spokes, sectors via the shared arc tessellation, lines + points, rim labels, entrance that grows bars and draws lines), `hitPolar` (sector, then nearest line point), `<PolarChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `polarToSvg` (server-safe), and the option facade routes `bar`/`line` series with `coordinateSystem: 'polar'` (top-level `polar.radius`, `angleAxis`/`radiusAxis` category + `min`/`max` + `startAngle` + `clockwise`, per-series `stack`/`itemStyle.color`; any other series type on the polar coordinate warns). Conformance corpus 25 → 26, floor 23 → 24. (bbf1800)
- `<RadarChart>` joins the plot engine's component family — one polygon per datum over shared spokes, each axis normalised by its own max so mixed-unit axes stay comparable. Ships with the same accessibility contract as its siblings (derived `aria-label` + offscreen data table), an optional wrapping legend, translucent fills with full-strength outlines, and the shared radial host sizing (parent-measured width + resize observer), which is now extracted to one module so the pie/gauge/radar trio cannot drift apart again. (559e5f7)
- `<PieChart>` and `<GaugeChart>` from `@pyreon/charts/plot` cross to native: PMTC lowers them to the new runtime `PyreonPieChart` / `PyreonGaugeChart` views (SwiftUI + Compose), drawn by the generated `PyreonChartEngine` — web and native render the same byte-locked geometry. Accessor props pass through as closures (the wrappers are generic over the row type, with `Number`/`Int` seams for integer columns), `data-testid` + a11y ride the special-emitter tail, and the decline paths warn by name (an `(d, index)` accessor, missing required props, the web-only legend/hit-testing surface). The charts manifest now declares `nativeFrontend`, so subpath imports of the web-only components (`PlotChart`, heatmap, candlestick) get the per-package advice instead of silence — the symbol-level warn table lookup is root-normalized (`@pyreon/charts/plot` matches the `@pyreon/charts` entry; the `/webview` bridge stays exempt). (f22774f)

  The diagnose catalog teaches the unlowered-chart-tag error: `cannot find 'PieChart' in scope` / `Unresolved reference 'PlotChart'` now explains the radial decline paths and the web-only cartesian family, with the `<Web>`/webview remedies.

- Series labels are a first-class engine module: `label.formatter` takes ECharts' `{a}` (series name), `{b}` (category), `{c}` (value) and `{d}` (share of the series total) as well as a function; `label.color` and `label.fontSize` style the label; `\n` breaks a line; and `label.rich` names the styles a `{name|text}` segment can take, laid out about the same anchor a one-line label uses. A plain label still emits exactly one text command, so nothing changes for the common case. What a rich style changes beyond a colour and a size is named rather than ignored. (a89478f)
- River's axis and tick labels now read the chart theme, and the SVG⇄canvas theme (ee4c24d)
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

- Rounded bars — `borderRadius` on a bar-family mark (ECharts' `itemStyle.borderRadius`), the first command of DrawCmd v2. A number rounds all four corners, `[topLeft, topRight, bottomRight, bottomLeft]` rounds them individually, and the radius travels in the draw list as `corners` on the rect command rather than in any one backend: the web canvas traces four arcs, the SSR SVG emits a path of the same four arcs, and the SwiftUI and Compose canvases build the same path from the same clamped numbers. The clamping lives in the ENGINE (`cornerRadii`, half the shorter side), so it crosses to native with the generated engine and a bar animating up from the zero line rounds proportionally on all four backends instead of by four platform conventions. A mark without `borderRadius` emits no `corners` key at all, so existing charts serialize byte-identically. (e6ef4e3)
- Right-to-left charts: `rtl` on `<PlotChart>` and every canvas host, and on the (7e489de)
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

- Sankey family: `layoutSankey` (columns by longest path with cycle back-edges, self-loops and unknown endpoints dropped BY NAME rather than silently; node bands sized by max(in, out) at one shared scale; weighted-centre relaxation with collision resolution; `nodeWidth`, `nodePadding`, `iterations`, `align: 'left' | 'justify'`), `ribbonPoints` (S-curve ribbons stacked so they never cross at a node, entrance growing from the source), `renderSankey`, `hitSankey` (band, then ribbon via point-in-polygon), `<SankeyChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `sankeyToSvg` (server-safe), and the option facade maps `type: 'sankey'` (`data`/`nodes` + `links`/`edges`, `nodeWidth`, `nodeGap`, `nodeAlign`, `layoutIterations`, `label.show`; `orient: 'vertical'` warns). Conformance corpus 21 → 22, floor 19 → 20. (5346f90)
- `@pyreon/charts/plot` grows the scale and mark vocabulary a production chart needs, in the engine so it crosses to iOS/Android: (74e9151)

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

- `<OptionChart>` honours ECharts' `selectedMap` on cartesian series. Items named in it (by their own `name`, else their category), or every item for `'all'`, start selected and paint in their `select` style. With `selectedMode: 'series'`, the series starts pinned. The pins are seeded once per option, so a later click still owns them. (896d747)
- Series symbols: `points(y, { symbol })` draws every datum as a rect / circle / diamond / triangle, and `line(y, { symbol })` draws a symbol at every datum over the line. The option facade maps ECharts' `symbol`, `showSymbol` (lines opt in) and `symbolSize`; `roundRect` / `emptyCircle` alias, other spellings warn by name. (f2b1d43)
- **Every `@pyreon/charts/plot` host gets the interaction stack.** Seventeen hosts now share one canvas host (`canvas-host.tsx`): `showTitle` / `subtitle`, `showLegend`, `tooltip`, `animate` (an entrance tween honouring `prefers-reduced-motion`), the resize observer, the accessible table and the theme resolution are one implementation instead of seventeen copies — and Treemap, Sunburst, Tree, Sankey, Graph, River, Polar, Gantt, Calendar, Parallel, Map, Funnel, Pie, Radar, Boxplot, Heatmap and Candlestick all draw a title, a legend (where the family has named entries) and a pointer tooltip for the first time. Selection is uniform: every host carries `onSelectIndex` (the engine's index — what the native tap reports) beside its rich `onSelect`; `<RadarChart>` gains a hit test (`hitRadarIndex` → `{ series, axis }`) and so its first `onSelect`. (02255a2)

  Bars are rounded by default: `theme.radius` (3) rounds the corners AWAY from the baseline on plain bars (top for positive, bottom for negative, right/left when horizontal); a mark's own `borderRadius` still wins; `radius: 0` restores square bars. Stacked and grouped segments keep only their mark radii.

  `<PlotChart maxPoints>` thins the visible slice with LTTB on the first mark when it exceeds the cap (rows stay aligned across marks); hits, tooltips and selection report the GLOBAL index of the row actually drawn.

  `bun run --filter=@pyreon/charts bench:engine` measures layout + render throughput of the engine itself (bars/line/area/points at 1k–100k, treemap, sankey, LTTB), with a command-count correctness gate.

  Native: the compiler warns BY NAME for chrome props a target does not draw yet (`tooltip` / `animate` everywhere; `showTitle` / `showLegend` outside PlotChart / Pie / Radar) and for `maxPoints`, instead of dropping them silently; the rounded default crosses through the generated engine.

- Single-axis coordinate: `layoutSingleAxis` (one horizontal category or value axis with nice ticks, points placed along it and sized by a second dimension), `renderSingleAxis`, `hitSingleAxis`, `singleAxisToSvg` (server-safe), and the option facade routes `scatter` with `coordinateSystem: 'singleAxis'` over the top-level `singleAxis` (`type`, `data`, `min`/`max`, `name`; `[position, size]` or scalar data, `symbolSize`, labels, colours; other series types warn by name). Conformance corpus 36 → 37, floor 34 → 35. (fea7fde)
- A single family chart in `<OptionChart>` now sits where ECharts places it in the whole chart. A pie, gauge, sunburst or chord takes its `center` and a 75% default `radius`, and a funnel, treemap, tree or sankey takes ECharts' default margins or its own `left`/`top`/`right`/`bottom`/`width`/`height`. The title and legend draw over it. Before, the family filled the box. The canvas host gains a `frame` prop for this. (896d747)
- `sonifyValues(values, options)` — a series as sound: values map linearly to pitch (`minHz..maxHz`), an oscillator steps through them over `duration`, gaps play as silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair along with the audio. Injectable `AudioContext`; `play()` resolves when done or on `stop()`. (6ea2c9c)
- `@pyreon/charts/plot` option facade: `series.stack` on a line series stacks it on the running total of its group (a gap carries the total), and a stacked area series resolves to the engine's `stackedArea` kind — the option no longer warns that stacked lines are unsupported. (f2b1d43)
- Sunburst family: `layoutSunburst` (radial partition — one ring per depth, sibling spans proportional to value inside the parent's span, `padAngle`, `maxDepth`, `sort: 'desc' | 'none'`, `startAngle`, stable child-index paths, inherited colours tinted per ring), `renderSunburst` (arc bands via the shared polygon tessellation, labels only where the chord fits, clockwise entrance sweep), `hitSunburst` (deepest arc, hole-aware, wraps past 12 o'clock), `<SunburstChart>` (reactive canvas host, `innerRatio`, `onSelect(arc)`, accessible leaf table), `sunburstToSvg` (server-safe), and the option facade maps `type: 'sunburst'` (nested data, `radius: [inner, outer]` → hole ratio, `sort: null`, `startAngle` degrees, `label.show`, per-node `itemStyle.color`). Conformance corpus 19 → 20, floor 17 → 18. (5346f90)
- The static SVG helpers and the canvas hosts now read the same theme (c19fb0d)

  `gaugeToSvg` drew its value arc `#0f766e`, its track `rgba(132,150,165,0.22)`
  and its value text `#10161d`, while `<GaugeChart>` — same props, same default
  theme — drew `theme.palette[0]` (`#4f7df3`), `theme.grid` and `theme.text`.
  Three of three colours differed, so the SSR/static export of a chart did not
  match the chart the browser drew. `radarToSvg` had the same shape on its rings.

  Fifteen of the seventeen `*ToSvg` helpers also took no `theme` at all, and
  eleven families defaulted their own label / grid / axis colours to fixed
  light-mode literals on BOTH paths — `#334155` labels on a dark ground is
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

- Theme registry and locale packs for the option facade: `registerTheme` / `getTheme` / `listThemes` / `resolveTheme` over an ECharts-shaped `ThemeDefinition` (palette, background, text colour + size, axis and grid colours; `light` and `dark` built in), applied via `compileOption(option, { theme })` — series without an explicit colour take the palette, the spec takes the text/axis/grid colours, and `optionToSvg` paints the background; an unknown name warns and falls back. `registerLocale` / `getLocale` / `numberFormatter` / `dateFormatter` over Intl with optional packs (number options, date options, month names), applied via `{ locale }` to value-axis labels and time-axis labels unless the option carries its own formatter. (fea7fde)
- `<ChartThemeProvider>` takes `light` and `dark` overrides that apply only in their mode, over the shared `theme`: (d5a7c06)

  ```tsx
  <ChartThemeProvider mode={useMode} theme={{ palette: palettes.okabeIto }} dark={{ background: '#0b1020' }}>
  ```

  A provider without `mode` inherits the mode above it, so its `light` or `dark` still picks correctly. Both are plain data, so they lower on iOS and Android through the provider's compile-time scope, where a mode-branching `theme` accessor cannot.

- Theme-river family (streamgraph): `layoutRiver` (layers stacked without gaps on a symmetric `silhouette` baseline or a `zero` baseline, missing values as 0, widest-point label anchors, category ticks), `smoothPoints` (Catmull–Rom sampling) + `layerPolygon`, `renderRiver` (layers back to front, axis, labels only where the layer is thick enough, left-to-right entrance), `hitRiver` (front-most layer under the point), `<RiverChart>` (reactive canvas host, `onSelect(layer)`, accessible table), `riverToSvg` (server-safe), and the option facade maps `type: 'themeRiver'` (`[date, value, name]` triples grouped into streams over the sorted date axis, `singleAxis`, `label.show`; a malformed triple warns by index). Conformance corpus 26 → 27, floor 24 → 25. (05f4b35)
- The chart theme swapped its palette and nothing else (52b0b60)

  **The theme gains semantic and ramp slots, because `linkColor` was not the
  whole class.** A sweep of every `options?.X ?? '<literal>'` colour default in
  the engine, cross-checked against what the hosts actually feed, found seven
  that no host feeds at all — so the constant always shipped:

  |                                                               | on `#ffffff` | on `#141821` |
  | ------------------------------------------------------------- | -----------: | -----------: |
  | `calendar.emptyColor` / `geo.emptyColor` `#e2e8f0`            |       1.23:1 |  **14.41:1** |
  | `candlestick.downColor` / `parallel.highlightColor` `#b42318` |       6.57:1 |   **2.70:1** |
  | `candlestick.upColor` `#15803d`                               |       5.02:1 |       3.54:1 |
  | `gantt.todayColor` `#dc2626`                                  |       4.83:1 |       3.68:1 |

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

- **`@pyreon/charts/plot` gets one theme.** `ChartTheme` is now a token map — `palette`, `background`, `surface`, `text`, `label`, `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius`, `enterMs`, `updateMs` — and every host, family, legend, title and tooltip reads from it. Series colours come from `theme.palette` (the nine private copies of one hex list are gone), so "change the series colours" is finally a theme. `chartThemes.light` / `chartThemes.dark` ship built in, `palettes` exports the named sets (`pyreon`, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`, `tableau10`, `okabeIto`, `tailwind`), and the new default palette is Pyreon's own. `<ChartThemeProvider mode theme>` provides a theme to every chart below it (`mode={useMode}` hands PyreonUI's mode through); with no provider a chart follows `prefers-color-scheme`. `registerTheme` accepts the same tokens (ECharts-shaped aliases still work). Breaking: `ChartTheme` gained required fields — a hand-built full `ChartTheme` needs them (a `Partial` on the `theme` prop is unchanged); the built-in `dark` registry theme is now Pyreon's dark theme, not ECharts'. (02255a2)

  Also on `/plot`: `<BoxplotChart>` + `fiveNumber` and the `sma` / `ema` / `bollinger` / `trend` indicator marks were built and tested but never exported — they are now.

  Native: the theme struct crosses with every field, `theme={{ palette: [...] }}` colours a plot's marks on iOS/Android, and `palette.ts` joins the generated engine.

  PMTC lowers `readonly T[]` / `ReadonlyArray<T>` exactly like `T[]` (the theme palettes are `readonly string[]` end to end, so an `as const` palette typechecks as a theme override); `keyof` / `unique` types warn by name.

- OptionChart and optionToSvg now place a title the way ECharts 6 does. It is centred and sits 15 px from the top inside a 5 px padding, set in 18 px bold over a 12 px subtext 10 px below. The title reads `top`, `bottom`, `textVerticalAlign`, `padding`, `backgroundColor` and borders. A number or percent `left` / `right` places the block's edge, and both lines stay left-aligned as ECharts' do. Several titles all draw, and `link` / `sublink` open on click with a pointer cursor. Placement is checked against ECharts' own SSR output. Colours still come from the chart's theme. (896d747)
- Toolbox on `PlotChart` (ECharts' `toolbox`): `saveAsImage` exports the current frame as an SVG through the engine's own serializer (download, or `onSaveImage(svg)` for custom handling), `restore` resets zoom, brush, legend toggles, legend page and any magicType override, and `magicType: ['line', 'bar']` retypes the independent marks (stacked/grouped/points keep their geometry). `toolbox.ts` is a pure layout (`renderToolbox`/`hitToolbox`/`toolboxTools`) with the legend's hit-rect contract. (8d1ff30)
- `<OptionChart>` honours ECharts' tooltip component and animation keys, and the (d3fa2c6)
  option contract is now measured against ECharts' own types.

  **Animation.** Option charts animate as ECharts does: an entrance (1000 ms
  `cubicOut`) and an update tween (300 ms `cubicInOut`), governed by the
  option's `animation`, `animationDuration`, `animationEasing`,
  `animationDelay`, their `…Update` twins and `animationThreshold`, on the
  option or a series, with ECharts' 31-curve easing table. They used to be
  pinned off, so these keys were accepted and never read. Set `animation: false`
  for a static first paint. Family option charts (pie, sankey, …) keep one host
  alive across updates, so an update tweens instead of remounting and replaying
  the entrance. The shared canvas host gains `enterDuration`, `enterDelay`,
  `updateDelay`, `enterEasing` and `updateEasing`.

  **Tooltip.** The option's `tooltip` component now decides the tooltip, as in
  ECharts (no component, no tooltip): `trigger` (`item` / `axis`), template and
  function `formatter`s (HTML renders through an allow-list), `valueFormatter`,
  `order`, every `position` form, `confine`, the look keys, `triggerOn`,
  `hideDelay`, `alwaysShowContent`, `enterable`, and `tooltip.axisPointer`
  (`line`, `shadow`, `cross` with axis labels). These were dropped without a
  warning.

  **Fixed on the way.** A redraw whose content equalled a running tween's target
  cancelled the tween. Hovering an option chart dropped its brush areas,
  visualMap strip, graphic elements and timeline strip from the frame.

  **Measured contract.** A new test enumerates every option key the installed
  ECharts types define and requires each to be read, inert, or filed as a gap
  under a capability-ledger row, which is then capped at partial. Keys the
  facade listed as known but never read (polar `barWidth`, graph `edgeSymbol`,
  treemap `breadcrumb`, …) now warn by name instead of being silently accepted.

- Tree family: `layoutTree` (tidy node-link layout — every leaf takes one slot, parents centre over their leaves; `orient: 'LR' | 'RL' | 'TB' | 'BT' | 'radial'`, `maxDepth`, a label gutter, stable child-index paths, inherited colours), `linkPoints` (smooth S-curves, orthogonal elbows, straight radial spokes), `renderTree` (links → symbols → outward leaf labels / inward inner labels, root-first entrance), `hitTree` (nearest symbol within a halo), `<TreeChart>` (reactive canvas host, `onSelect(node)`, accessible table), `treeToSvg` (server-safe), and the option facade maps `type: 'tree'` (`orient`/`layout: 'radial'`, `symbolSize`, `initialTreeDepth`, `edgeShape: 'polyline'` → elbow, `label.show`, per-node `itemStyle.color`). Conformance corpus 20 → 21, floor 18 → 19. (5346f90)
- An ECharts treemap option now lays out exactly as ECharts lays it out. (f1feb10)

  - **Squarify:** ECharts' own, with its golden-ratio `squareRatio` target, its
    row flushing and its `sort` (`'desc'` by default, `'asc'`, or input order
    when `sort` is `false`; any other value sorts descending, as ECharts does).
  - **Box:** ECharts 6's 20 / 50 / 20 / 50 px, placed by `left` / `top` /
    `right` / `bottom` / `width` / `height`.
  - **Borders and gaps:** `itemStyle.borderWidth` / `gapWidth` resolve per
    node from the datum, then `levels[depth]`, then the series, as ECharts'
    tree model does. `upperLabel` reserves its band.
  - **Visibility:** `visibleMin` drops cells under the threshold,
    `childrenVisibleMin` hides grandchildren of a too-small parent, and
    `leafDepth` is honoured.
  - **Values:** a parent's value is its own, else its children's sum, clamped
    at zero.

  Parents paint a ground in `itemStyle.borderColor` (the chart background, else
  white). Leaves are labelled at their centre, truncated as zrender truncates.
  17 layout cases are differential-tested to within 1e-6 px against the
  layouts ECharts' own model computes.

  `<TreemapChart>` gains an `echarts` prop carrying this. Without it the
  component keeps its own layout. Still open: `levels` colours and the visual
  mapping, upper-label text, the breadcrumb, drill-down and roam. On iOS and
  Android an option treemap still draws the component's layout; the native
  engines are regenerated with the new functions.

- Treemap family: `layoutTreemap` (squarified layout of a value hierarchy — Bruls/Huizing/van Wijk rows, padded nesting, `maxDepth`, stable child-index paths, inherited colours tinted per depth), `renderTreemap` (fills per depth, leaf labels only where they fit, entrance scaling), `hitTreemap` (deepest cell), `<TreemapChart>` (reactive canvas host, `onSelect(cell)`, accessible leaf table), `treemapToSvg` (server-safe), and the option facade maps `type: 'treemap'` (nested `{ name, value, children }` data, `leafDepth`, `label.show`, per-node `itemStyle.color`). Conformance corpus 18 → 19, floor 16 → 17. (5346f90)
- The verification batch of the charts audit — the hosts are now MEASURED where they run, and the gaps that measuring found are closed: (2b8533b)

  - **Browser coverage is a gate.** The node config excludes 21 host files as "fully exercised in real Chromium"; that promise was never measured. `vitest.browser.config.ts` now collects v8 coverage over exactly those files with thresholds set from the measurement (89.8% statements / 75.6% branches / 96.9% functions / 94.0% lines) that ratchet up. Measuring found hosts at 50–65% — each family spec proved its own geometry, nobody drove the shared paths on every host.
  - **A host sweep in real Chromium** (`host-sweep.browser.test.tsx`) drives all 20 hosts through the same paths: paint + chrome, the accessible surface (`role`, the table, `aria-describedby`), tooltip hit / miss / leave, click select through `onSelect` AND `onSelectIndex`, keyboard focus / walk / Home / End / Enter / Escape / blur with the live region, and PNG export. It found and this release fixes: no keyboard pick on `<RiverChart>`, `<HeatmapChart>`, `<PolarChart>` and `<RadarChart>` (Enter did nothing); `<PlotChart>` lacking the `onSelectIndex` twin; and `<OptionChart>`'s cartesian surface bypassing the shared host — it now rides `canvasHost`, so it carries `tooltip`, `keyboard`, `toolbox` / `onSaveImage`, `onSelectIndex` and the `aria-describedby` table like every other host. Its canvas mounts only for a cartesian plan (a family option shows only the family host's canvas; the `data-pyreon-step` attribute moved to the wrapper).
  - **Draw-list goldens** (`goldens.test.ts`, 22 families): the SVG for a fixed dataset per family, committed and compared byte-for-byte. Deterministic across platforms, unlike pixel baselines, and a diff names the command that moved.
  - **A real-app interaction leg** in the app-showcase e2e: hover, click and keyboard on the plot-engine chart under the shipped compiler. It found two things synthetic events cannot see — the chart REMOUNTED on every query settle (it was rendered inside a conditional accessor over `query.data()`, so a real pointer's tooltip was torn down mid-move; now `<Show>` + a reactive `data` accessor, bisect-verified in both directions) and a real pointer only reaches what is on screen.
  - **A comparison arm in the engine bench**: spec → SVG string, the engine's `renderSvg(renderChart(…))` against ECharts' SSR renderer, same rows and size. Measured 2026-09-08 (Bun, macOS, K=15): bars n=1000 1.40 ms vs 6.89 ms, bars n=10000 13.4 ms vs 59.0 ms, line n=10000 6.10 ms vs 11.6 ms. ECharts renders more chrome by default, so the number is that surface and nothing finer.
  - Dead code removed: `radial-host.ts` (superseded by the shared host, referenced by nothing).

- `<SankeyChart>`, `<CalendarChart>` and `<ParallelChart>` take `orient="vertical"` (the option facade honours `series.orient`, `calendar.orient` and `parallel.layout` instead of warning): the horizontal layout reflected across the diagonal, on web, iOS and Android. `transposeCmds` / `transposeRect` / `transposePoint` join the engine's RTL mirror as pure draw-list transforms. (f2b1d43)
- visualMap component: `visualMapSpec` (reads `visualMap` — `inRange.color` stops, `min`/`max` or the first series' data extent, `type: 'continuous' | 'piecewise'` with explicit `pieces`, `categories`, or `splitNumber`, `orient`, `text`, `itemWidth`/`itemHeight`, `show: false`; `calculable` warns), `renderVisualMap` (a 24-stripe ramp strip with end labels, or swatches + labels, vertical or horizontal, reporting its size), `domainFromSeries`, and `visualMapCommands` (placed by `left`/`right`/`top`/`bottom`, ECharts' bottom-left default) — appended above the chart in `optionToSvg` for both facade halves and exported for hosts. Conformance corpus 28 → 29, floor 26 → 27. (05f4b35)
- `<ChartWebView group>` — connected groups across hosted charts. Hosts sharing a `group` mirror dataZoom, legend selection, highlight/downplay and the data-anchored tooltip, the same action classes `echarts.connect` shares. Every hosted chart is its own page, so the engine's own `connect()` can never reach a sibling host; the hosted page joins the `<WebView>` host group of the same name and relays those actions through it, identically on web, iOS and Android. Closes the last pending row of the hosted capability ledger. (f2b1d43)
- `<OptionChart>` honours ECharts' `zlevel` and `z` on series. A cartesian series with a higher `zlevel`, then `z`, now paints over a lower one; the legend, palette and hit test keep series order. Family layers stack among themselves the same way. The engine's `ChartSpec` gains an optional `drawOrder`, and the native engine is regenerated to paint by it. (896d747)
- The framework-wide colour mode now reaches the rest of the framework. (d5a7c06)

  - **`@pyreon/core`:** `useProvidedColorMode()` returns the mode an app explicitly set (`<PyreonUI mode>` / `<ColorModeProvider mode>`), or `undefined` when none did. It is for components whose own default is not "follow the system", so adopting the shared mode never flips them on a page that never asked.
  - **`@pyreon/flow`:** with no `colorMode`, a flow takes the app's colour mode, and is still light when the app set none. An explicit `colorMode` still wins.
  - **`@pyreon/code`:** an editor created without a `theme` follows the app's colour mode once mounted in `<CodeEditor>`, live. An explicit `theme` still wins, and with no app mode the default is still light.
  - **`@pyreon/charts`:** `<OptionChart>` follows a mode the app set. With none, it keeps ECharts' own light look, and it still ignores the bare OS scheme, as ECharts does.
  - **`@pyreon/zero`:** the theme now also declares the CSS `color-scheme` on `<html>`, beside `data-theme`, in `setTheme`, on setup and in the pre-paint script. Native form controls and scrollbars follow it, and so does the shared colour mode, so a zero theme toggle reaches charts, flow and the code editor with no wiring. **`themeScriptCspHash` changed with the script:** an app that pinned the old hash in its own `Content-Security-Policy` header must take the new value.
  - **`@pyreon/native-compiler`:** `useColorMode()` lowers to the platform scheme read, exactly as `useColorScheme()` does.
  - **`@pyreon/hooks`:** `useColorScheme()`'s docs point to `useColorMode()` for theming; it reads the OS only.

- The geo layout is a crossable shape: normalised rings, and a transform instead of a closure (1289bf1)

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

- The geo geometry crosses into the native engine (4e8a34d)

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

- `<MapChart>` lowers to iOS and Android from a precomputed `GeoShape[]` (ae94355)

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
  so a native map's borders read `#ffffff` on light and `#141821` on dark —
  the same values the web host computes.

- Render native-safe geographic paths and point marks through `MapChart` on web, iOS, and Android. (f2b1d43)
- Add cross-platform point-index selection for geographic overlays. (f2b1d43)
- Bundle native-safe geographic point and path overlay geometry into the generated Swift and Kotlin chart runtimes. (f2b1d43)
- A literal `<OptionChart>` pie or gauge now draws on iOS and Android as the web compiled it. (896d747)

  - **Pie:** ECharts' arcs (start angle, direction, rose, minimum and pad angles), its outside labels with guide lines and overlap avoidance, and per-datum colours all cross. Taps and tooltips hit the same laid-out arcs.
  - **Gauge:** the whole ECharts dial crosses: colour bands, ticks, split lines, axis labels, pointer, anchor, titles and the formatted detail. Before, native drew a half-circle track.

  Placement (`center`, `radius` and the box keys) now resolves through a new engine module, `frame`, at the device's own size. The web uses the same function, so the two targets place a chart identically. `renderDial` takes an optional palette, and the new `renderDialIn`, `pieHitWith` and `pieTipWith` are shared by web and native.

- `<PlotChart selectedMode onSelectChange>` now lowers to iOS and Android: a tap (1373888)
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

- One light/dark mode for the whole framework. `useColorMode()` in `@pyreon/core` returns the mode in scope: the nearest `<ColorModeProvider mode>` or `provideColorMode(mode)`, else the page's declared `color-scheme`, else `prefers-color-scheme` (light on the server). `mode` is `'light'`, `'dark'` or `'system'`, or an accessor. `systemColorMode()` is the page-and-OS half alone. (d5a7c06)

  `<PyreonUI mode>` now provides it, so everything below a PyreonUI follows the UI system's mode with no extra wiring.

  **Breaking, `@pyreon/charts`:** charts read the shared mode, so a chart below a dark `<PyreonUI>` is dark. `<ChartThemeProvider>` no longer takes `mode`: set it with `<PyreonUI mode>` or `<ColorModeProvider mode>`. `systemChartMode()` is now `systemColorMode()` in `@pyreon/core`. The provider hands down a theme per mode, so a mode set below a provider still picks that provider's `light` / `dark` override. `pyreon doctor diagnose` explains both upgrade errors.

  **Native:** a literal `<ColorModeProvider mode>` or `<PyreonUI mode>` is a compile-time scope the charts below inherit, and it re-resolves an outer provider's per-mode overrides. `'system'` keeps the platform scheme. A reactive mode on `<ColorModeProvider>` warns by name; on `<PyreonUI>` it is silent, as it was before. In both cases the charts below follow the platform scheme instead of being pinned to light.

### Patch Changes

- The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated. (2ac084f)

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- Add a typed single-axis canvas host and lower static option-format calendar heatmap, parallel-coordinate, river, polar, and boxplot charts through their native engines on SwiftUI and Compose, preserving calendar range and visual settings, values, axes, categories, domains, line styles, grouped streams, multiple polar series, and five-number summaries. (f2b1d43)
- Export a versioned capability ledger and separate direct-native and hosted coverage scores so incomplete chart contracts cannot be reported as complete. (f2b1d43)
- Render horizontal and vertical option mark areas with labels and colours through the shared web, SwiftUI, and Compose draw-list engine. (f2b1d43)
- The accessible data table a chart renders for screen readers now builds its (896d747)
  rows into 50-row `<tbody>` blocks instead of one. On a 1,000-point line chart
  that cut first render from 12.5 ms to 10.4 ms in a back-to-back run. Every row
  stays in the accessibility tree; a browser spec reads Chromium's tree to hold
  that.
- The ECharts `brush` works on web and native. (244fe91)

  - `PlotChart` takes `brushType` (rect, polygon, lineX, lineY), `brushMode`, `outOfBrushOpacity`, `brushSeriesIndex` and `onBrushSelected`. Datums outside the brush fade, and the callback reports the brushed data indices per series.
  - `toolbox.brush` adds the rect / polygon / lineX / lineY / keep / clear tools.
  - `OptionChart` reads `option.brush` and `toolbox.feature.brush`, and reports through `onBrushSelected`. As in ECharts, a brush is taken up through its toolbox tool.
  - iOS and Android lower all of it onto the chart host. The selection geometry is one shared engine module.

- Axis `offset` maps on web and native: the x axis and both y axes move off the plot edge by their offset, with their labels, and the gutter grows by the same amount so nothing clips. Native spec literals now accept numbers. (69391bd)
- Axis `position` maps on web and native: `xAxis.position: 'top'` draws the x axis above the plot, a lone `yAxis.position: 'right'` draws the value axis on the right, and two y axes whose first is placed right swap sides with `yAxisIndex` following. Two y axes placed on the same side warn by name. (69391bd)
- Decals follow ECharts' model on web and native. A decal tiles its `symbol` (rect, circle, triangle, diamond, pin or arrow) on the `dashArrayX`/`dashArrayY` pitch, scaled by `symbolSize` and turned by `rotation`. Previously every decal collapsed to diagonal, cross or dots. `aria.decal.show` gives each series without a decal a distinct default texture. Pattern geometry now lives in one engine function (`patternMarks`) that the web canvas, SVG, SwiftUI and Compose painters all draw, so a texture cannot differ by target. `ChartPattern` gains `angle`, `symbol` and `spacingY`, and a `symbols` kind. (244fe91)
- The chart handle's `dispatch` (ECharts' `dispatchAction`) is now one pure reducer, `applyChartAction`, and it runs on web, iOS and Android. (244fe91)

  - New actions: `takeGlobalCursor` (arm the area brush) and `brush` (set or clear its areas), plus `timelineChange` and `timelinePlayChange`.
  - `OptionChart` takes a `handle`, which binds its zoom, hover, pinned datums, brush and timeline step / play state.
  - A dispatched `brush` fires `onBrushSelected`, as a drag does.
  - On native, `createChartHandle()` lowers to a `PyreonChartHandle`. A bound `PlotChart` or `OptionChart` reads and writes its fields, and `handle.dispatch({ ... })` with an inline action object lowers too.
  - Fixed: a `PlotChart` with `selectedMode` under a zoom window no longer fails to compile on native.

- Docs: manifest entries for `<OptionChart>`, `<GanttChart>`, `createChartLink` and `sonifyValues` (MCP `get_api`, llms), an Interaction section (dataZoom, navigator, zoom presets, keyboard, update animation, linked charts), Gantt, sonification and option-host sections on the plot docs page, and the README. (61fea37)
- A third and later y axis (`yAxis[2]`, `yAxis[3]`, …) is now drawn on web and native, on its `position` side at its `offset`, with its own domain, tick labels and title. A series with `yAxisIndex: 2` or higher scales on it. A `yAxisIndex` that names no declared axis warns by name. (69391bd)
- Every series on a `geo` now draws. Previously only the first series rendered and the rest were silently dropped. `scatter`, `effectScatter` and `lines` combine. A `heatmap` on the geo draws soft radial blobs coloured by the visual map, a `pie` with `center: [lon, lat]` draws at that point, and a `map` series with `geoIndex` colours the geo's regions. `<MapChart>` gains `heat`, `heatRadius`, `heatStops` and `pies` on web and native. Anything else on a geo (a series off it, a pie without a centre, an unsupported type, a trail on geo lines) warns by name. `withAlpha` now applies alpha to `rgb(...)` colours; it used to return them fully opaque. (69391bd)
- Geo lines animate their `effect` trail on web and native. An ECharts `lines` series on a geo carries its trail (`period`, `trailLength`, `color`, `symbolSize`), and `<MapChart trail>` runs it along `paths` on the same frame clock as cartesian lines: the web canvas host's clock, or `PyreonChartClock` on native. Under reduced motion the trail holds still. (69391bd)
- `<Chart>` (formerly `<Plot>`) no longer bundles the pie, funnel, heatmap and candlestick renderers when you don't use them. Each family mark (`<Arc>`, `<Stage>`, `<Cell>`, `<Candle>`) now carries its own host component, so importing `Chart` and `Line` costs 47.8 KB gzipped instead of 65.9 KB, 27% less. A pie through `<Arc>` no longer includes the other three families either. An import budget in CI locks this in. (f3816f2)
- Engine: hex color decoding (radar's `withAlpha`, heat's ramp channel reader) now uses `charCodeAt` arithmetic instead of String Int-subscripts and `parseInt` radix — byte-identical rgba/rgb output on web (full test suite green), and the shapes Swift rejects outright ("cannot subscript String with an Int") are gone from the native draw-pipeline bundle. (f727234)
- Hit-test stacked and grouped bars, size the radial charts to their container, escape `idPrefix` (78de81b)

  **`onSelect` was permanently dead for `stacked` and `grouped` bars.** The hit test bailed on `kind !== 'bars'` behind a comment excusing "a line/area chart" — but stacked and grouped _are_ bar marks that draw real rects, so every click reported `-1` while `onSelect`'s own JSDoc says it fires "with the datum index when a bar is tapped". The tooltip shared the same bail, so it never appeared over those charts either. `layoutStackedBars` / `layoutGroupedBars` were already public; they simply were not asked, because those series are laid out TOGETHER (each needs the others to place its bars) and so cannot be queried one series at a time the way `barsFor` does. `stackedHitAt` asks them as a set and returns the datum index, matching what a plain bar series reports.

  **`<PieChart>` and `<GaugeChart>` pinned themselves at mount width.** They read `el.clientWidth`, and `prepareCanvas` writes an inline `canvas.style.width` — so the first measurement is what every later read returns, and the chart stays that size forever. `<PlotChart>` measures the PARENT and observes it with a `ResizeObserver`, and its own comment documents this exact failure ("pinned at that fallback forever — 300px inside a 430px column, with nothing in the DOM looking wrong"); the radial family never got either half, while the documented example passes no `width`. The `?? 300` in that expression was dead code too — `clientWidth` is always a number. An explicit `width` still wins, and the observer is guarded against the feedback loop the draw itself causes.

  **`renderSvg`'s `idPrefix` was interpolated unescaped** into the root `<svg>`'s `id` and `aria-labelledby`, so a prefix of `a" onload="…` put a live handler on the element. It was the one interpolated option without `esc()` — eleven lines above `background`, which has it. The manifest tells callers to vary the prefix per chart, which is where a data-derived value comes from.

  **The WebView host builder** gets the same two escape fixes the other three packages received: `<style>` is raw text so `&quot;` was inert there and `</style>` in a `background` closed the element; and `</` → `<\/` alone does not stop the tokenizer entering the script-data-double-escaped state on `<!--`, where the page's own `</script>` no longer ends the element.

  Also restores `@pyreon/charts` to its declared 98% branch threshold. The package had been measuring 96.47%, which was invisible until the coverage gate began comparing every threshold a package declares rather than statements alone — at which point a pre-existing shortfall turned the gate red for every PR whose affected set reaches charts, which is any compiler change. The gap is closed with real assertions on what gets DRAWN (a reversed annotation band, a coloured rule, a rule with no label, a bubble whose radius array has a hole, an all-zero r channel, a malformed colour stop), not by lowering the number.

- fix(charts): two seams in the newest chart hosts — a frozen prop forward and a dropped RTL mirror (f29f70a)

  **`hostPropsFor` value-copied its passthrough props.** `<OptionChart>` receives a
  signal-driven prop as a getter (the compiler emits `_rp(() => …)` and
  `makeReactiveProps` installs it), and `hostPropsFor` runs once at setup — so
  reading `props[k]` there fired the getter and pinned the result forever. The host
  reads `width`, `height`, `title` and `rtl` LAZILY, so they would have been live;
  the copy is what froze them. `<OptionChart width={w()} />` ignored every later
  `w.set(...)` and laid out at the mount-time width. Now forwarded as live GETTERS — the descriptor-copy idiom the anti-pattern
  catalog prescribes for this "wrapper forwards user props" shape. NOT `_rp`
  thunks: `canvasHost({ props: … })` takes a plain object, not component props,
  so nothing runs `makeReactiveProps` over it and a thunk would arrive at
  `drawWidth(el, props.width)` as a function, sizing the canvas to 0. A getter
  reads transparently at every call site while staying live.
  Presence is still decided with `in`, which does not fire the getter, so an absent
  prop stays absent and the host's defaults still apply.

  **`paintCached` dropped the RTL mirror.** `canvasHost` has two paint paths and
  only `draw()` applied the presentation transform. `paintCached` runs on every
  tick of the update tween, on each arrow key, on Escape and on blur — so an RTL
  chart un-mirrored on the first keypress, and a data change painted frame 0
  mirrored and every later frame unmirrored, SETTLING unmirrored while the pointer
  seam kept mirroring. `present` now lives above both paths and both go through it.

  Both files are new this cycle (2026-09-03 and 2026-09-07), so neither shipped.

- Image patterns and `path://` / `image://` decal symbols draw on web and native. An ECharts `color: { image, repeat }` fill (a URL, a data URI, an `<img>` or a `<canvas>`) tiles at its natural size with `repeat`, `repeat-x`, `repeat-y` or `no-repeat`; an `image://` decal tiles the image on the decal pitch; a `path://` decal draws its SVG path (`M L H V C Q Z`), fitted to the symbol size. The web canvas, SwiftUI and Compose load each image once and repaint when it arrives. A line stroke image is named, since only fills take patterns. (244fe91)
- Moving the keyboard focus through a chart formats the one row it announces. It (bd76a4a)
  used to build the chart's whole data table, uncapped, on every arrow key, Home
  or End to read that row back out: on a 100,000-point line chart, 100,024
  formatted values per keystroke, now 25. The native chart engines are
  regenerated from the same table code; their behaviour is unchanged.
- Charts: a 100,000-point line mounts ~9× faster in real Chromium (~320ms → ~36ms), measured head-to-head against ECharts 6 in `examples/benchmark` (`bun run bench:charts`). The layout measured every category label with `measureText`; it now samples them the way ECharts' `calculateCategoryInterval` does (every `floor(n/40)`-th label past 40). The label step is no longer capped at 200, which drew ~500 overlapping labels on a 100,000-category axis. The accessible table formats only the rows it shows (`chartTable` takes a `limit` and reports `total`) and updates its cells in place instead of remounting 1,000 rows per draw. The y extent is streamed instead of copied twice per resolve, and the accessibility input reuses the drawn layout instead of laying the chart out a second time. (896d747)
- ECharts `lines` series are now an engine feature, and their animated `effect` trail works. The head travels each line once per `period`, trailing `trailLength` of it in `effect.color`, driven by a frame clock in the web canvas host and in new `PyreonChartClock` native views. Under reduced motion the clock holds at 0 and the chart is still. Native option charts lower `lines` series at all, where they previously emitted nothing. Effect keys that aren't mapped warn by name. (69391bd)
- `logTicks` walks its exponent range with a `while` loop instead of a compound-condition `for` head. Web behavior is byte-identical; the change keeps the function inside PMTC's canonical loop subset so the native-emitted engine retains the loop body instead of warn-dropping it. (6599ad9)
- Maps roam on web and native. `<MapChart roam>` (and an ECharts `map` series or `geo` component with `roam`) pans on drag and zooms on the wheel or pinch, about the pointer, within `scaleLimit`. `roam: 'scale'` only zooms and `roam: 'move'` only pans. The view is part of the engine's `GeoOptions` (`zoom`, `panX`, `panY`), so regions, overlays and hit tests follow it. On native the gestures run the same `geoRoamPan` / `geoRoamZoom`. Scatter and lines on a `geo` coordinate now render through the map canvas host, so they roam too. `center`, `aspectScale`, `layoutCenter` and `layoutSize` now warn by name instead of being silently ignored. (69391bd)
- `<FunnelChart>`, `<PieChart>` and `<GaugeChart>` lower to native. The accessor-prop hosts map their rows through the accessor bodies INLINED into one closure (`rows.enumerated().map { (i, d) in FunnelStage(value: Double(d.total), label: d.name, color: …) }` / `mapIndexed`), with the shared palette for an absent `color`; a block-bodied accessor warns by name. `onSelect` (already an index on these hosts) and `onSelectIndex` lower to the tap over `hitFunnel` / `hitArc`. `<GaugeChart>` lowers with its fixed half-circle box and the value text; `<PieChart showLegend>` renders without the legend and says so. README: the native-geometry section lists them. (8d1ff30)
- The candlestick and heatmap geometry join the generated native chart engine (`PyreonChartEngine.swift` / `.kt`): `ohlcExtent`, `renderCandles`, `buildHeatGrid`, `colorRamp`, `HEAT_RAMP` and `renderHeat` now lower with zero transform warnings and compile on both toolchains. Two engine-side idioms made it possible with no behavior change on web: `renderCandles` takes an OPTIONAL options object (an empty-object-literal default has no native lowering) and `buildHeatGrid` keys its aggregation map by an INDEX into the cells array (a Map with a struct value has no native lowering). (e669817)
- Docs: the README gains a "Native geometry" section stating that every `@pyreon/charts/plot` family is generated into `PyreonChartEngine.swift` / `.kt`, which API shapes exist because of the crossing (index hits, `{ min, max }` domains, ISO/day dates, `rampColor`, `calendarValues`, `parallelRows`, the seeded LCG), and what stays web-only (hosts, gestures, sonification, the tween, the option facade); the manifest's multiplatform rationale says the same, and the derived web-only rationale in `@pyreon/compiler`'s native audit and `@pyreon/native-compiler`'s web-only warning carries the same text. (8d1ff30)
- `@pyreon/charts/plot` family hosts lower to native. `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>` and `<PolarChart>` — the hosts whose props are plain data — now emit `PyreonChartCanvas` over the generated engine (`renderX(layoutX(...))` with the web host's own box arithmetic), sized by a `GeometryReader` / `BoxWithConstraints` or by `width` / `height`, with `title` as the accessibility label and `data-testid` as the identifier. The accessor-prop hosts (`PlotChart`, `PieChart`, `GaugeChart`, `RadarChart`, `FunnelChart`, `HeatmapChart`, `CandlestickChart`), `CalendarChart` (a record) and `ParallelChart` (mixed rows) warn BY NAME on native instead of naming a view that does not exist. Importing from `@pyreon/charts/plot` no longer raises the package's web-only warning (that rationale is about the ECharts bridge at the root). The Swift/Kotlin stub typecheck links the REAL generated engine when a chart host is present. `PyreonChartCanvas.kt` scales its draw list by the display density so the engine's units read as dp, matching CSS px on the web and points on iOS. README: the native-geometry section names the lowered hosts. (8d1ff30)
- Engine: coalesce-first optional idioms — `spec.progress ?? 1.0`, `spec.xValues ?? []`, `s.curve ?? identity`, `resolveYDomain` via `?? deriveYDomain(spec)`, annotation guards binding coalesced values before their presence checks. Value-preserving on web (full suite green); these are the shapes Swift can compile, since it does not narrow optionals through ternaries or compound guards. (dd72331)
- Docs: the multiplatform capability matrix gains a Charts (plot engine) row and the web-only table no longer lists `@pyreon/charts` as a whole — the `echarts` facade is web-only, the `/plot` engine and its hosts render natively. The manifest's multiplatform rationale says the same. (8d1ff30)
- Native option charts: a slider `dataZoom` under ECharts' grid now draws ECharts' own slider in the grid's bottom margin (the same ported strip the web draws, laid out from the option's box, with its drag overlay over it), instead of Pyreon's navigator band under a shrunk plot. A horizontal `legend.type: 'scroll'` on a cartesian chart now pages one row with the engine legend's pager instead of drawing every entry wrapped. (896d747)
- ECharts axes map further. On web and native, an axis `name` becomes its title, `show: false` hides the axis, `yAxis.splitLine.show: false` drops the grid, and `yAxis.type: 'log'` uses the log scale. Natively, `yAxis` may now be an array, whose second entry is the right axis (domain and title), and a series with `yAxisIndex: 1` scales on it. Unmapped per-axis keys and a one-sided `min`/`max` now warn by name instead of being silently ignored. (69391bd)
- `OptionChart` honours an ECharts `dataZoom` over the category x axis instead of ignoring it. `inside` zooms with the wheel and pans with a drag, and `slider` draws the navigator strip, whose band and handles drag the window. `start` / `end` (or `startValue` / `endValue`) set the opening window, `filterMode: 'none' | 'empty'` keeps the y extent of every row, and `zoomLock`, `minSpan` and `maxSpan` bound every gesture. Hits report the global row index, and `onDataZoom` reports the window in percent. SVG output draws the opening window and the strip. On native the option lowers onto `PlotChart`'s own zoom, which gains `initialZoom` and `zoomLimits` on web and native, with the limits applied by a new engine function. A y-axis or second-x-axis zoom is named, never applied to the wrong axis. (244fe91)
- `<OptionChart>` compiles its option once per change instead of six times per mount. The paint, the hit-test layout and the accessible input each planned the same option, twice per mount. The accessible path also laid the chart out at a fallback 300px width before the canvas existed, even when the chart had its own `width`. A 100,000-point option now mounts ~1.6× faster (55ms → 35ms in real Chromium), ahead of ECharts' 49ms on the same run. (896d747)
- A pictorialBar's `symbolClip`, `symbolMargin`, `symbolBoundingData`, `symbolOffset`, `symbolPosition` and `symbolRotate` warn by name instead of being accepted and silently ignored (`symbol`, `symbolRepeat` and `symbolSize` are the mapped keys). (f2b1d43)
- Presentation states — ECharts `emphasis`/`select`/`blur` — go further, on web and native. (244fe91)

  - A state's own stroke width (`lineStyle.width`) and area fill opacity (`areaStyle.opacity`) apply while that state is active.
  - `emphasis.scale` grows the highlighted point's radius (`true` reads as ECharts' own 1.1); `emphasis.disabled` stops a series from ever highlighting.
  - `emphasis.label` / `select.label` print the datum's label only in that state.
  - `selectedMode: 'series'` pins a whole series with one tap, on `PlotChart` and `OptionChart`, on web, iOS and Android — the bar/stacked/grouped outline and the line/area/point fill both honour it.
  - `emphasis.blurScope`'s three real values are accepted; an unknown one, `select.disabled`, `select.lineStyle`/`areaStyle`, `blur.label` and a state label's own styling are still named — a pinned datum has no line to stroke, and a blurred one keeps its own label.

  Found on the way:

  - `PlotChart` with `selectedMode` under a zoom window referenced rows a decimated chart never declares on native — fixed for the width-computed selection expressions too.

- Nine pre-release fixes in `@pyreon/charts/plot`, sharing one theme — an input the types allowed reaching a path that never considered it. (fe4e196)

  **RTL is a TWO-WAY seam, and only one direction was centralized.** `mirrorCmds` (chart → pixels) and `localX`/`localPoint` (screen → chart) were both in `./rtl`; the chart → SCREEN direction had no home, so both hosts wrote a chart-space x straight to the tooltip's `style.left` — a cursor at x=60 on a 400px `rtl` chart put the tooltip at `left:248px`, the mirror image of the pointer. Added `screenX` / `screenRectX` (a BOX mirrors by its far edge, so the point and rect forms differ), both exported from `@pyreon/charts/plot` so a custom host uses the same seam. The same gap in a second guise: `toolbox saveAsImage: 'svg'` serialized `lastFrame`, captured BEFORE the mirror — the SVG export was byte-identical in `rtl` and `ltr` while the PNG was mirrored.

  **`rtl` on `<OptionChart>` was typed, documented and silently dropped** — the facade hand-listed the props it forwards to the shared canvas host and never added it. The passthrough is now a map the type system requires to be TOTAL over `CanvasHostProps`, so a new host prop is a compile error until it is forwarded or explicitly omitted.

  **A non-finite value is a GAP wherever a NaN was one.** Several entry points tested `v === v`, which is a NaN check written as a finiteness check: an `Infinity` reached the geometry. `makeTicks` emitted 1000 NaN ticks for a non-finite bound (now zero); `extent` returned a NaN domain from one bad sample; `fiveNumber` produced 242KB of NaN SVG from one `Infinity` while its own docblock said non-finite values are dropped. Closed at every entry point user data reaches without `marks.ts`' coercion — bars, grouped/stacked bars, waterfall, parallel coordinates, calendar, bin, boxplot, bubble, geo, heat, navigator, polar, river, the tooltip, the accessible table and `sonifyValues`. `isFiniteNumber` is the one predicate (written in the native subset — `Number.isFinite` has no lowering in the crossing engine) and is exported.

  **`sonifyValues` constructed an `AudioContext` per `play()` and never closed one.** Chrome caps live contexts at ~6 per document, so the seventh press threw `NotSupportedError`. One context is now owned per hook, created lazily and closed when the run settles or is stopped; a caller-supplied `options.context` is never closed.

  **`<For>` inside `<Plot>` rendered zero marks, silently.** The child walk handled function children, arrays, `<Show>` and fragments but not `<For>`, and an unrecognized child was `continue`d with no diagnostic. `<For each>` now resolves through its render callback like a `.map()` child, and anything that is not a mark warns in dev naming the tag.

  **A server-rendered `<canvas>` carried no size** — `prepareCanvas` only runs on the client, so every hydrated chart laid out at the HTML default (300x150) and jumped to its real box on the first paint. The width/height and CSS box are now emitted as attributes when known.

  Also: `DEFAULT_PALETTE` / `DARK_PALETTE` are `readonly string[]`; the `accessibleTable` JSDoc is reattached to its property; and `rtl.ts` cited a `mirror-parity.test.ts` that has never existed (the real one is `packages/native/compiler/src/tests/native-chart-mirror-parity.test.ts`).

  The crossing engine sources changed, so the generated native engine is regenerated (byte-identical drift lock, zero transform warnings).

- A second x axis whose `data` has the same number of categories as the first is drawn on web and native, as a second set of labels (and its `name` as a title) on the opposite edge. Series may name it with `xAxisIndex: 1`. Any other second x axis warns by name. (69391bd)
- A theme river declared with `coordinateSystem: 'singleAxis'` (ECharts' required spelling) renders as a theme river instead of being skipped as an unsupported single-axis series; the single-axis warning names ECharts' own contract (scatter / effectScatter only). (f2b1d43)
- The ECharts `timeline` is interactive on web and native. Clicking a checkpoint jumps to that step, and the play / previous / next controls step it (`controlStyle.showPlayBtn` / `showPrevBtn` / `showNextBtn`). Auto-play honours `loop` and `rewind`, stopping at the end without `loop`. `checkpointStyle`, `lineStyle` and `label` colour the strip. A timeline over a family chart (pie, heatmap, …) now draws its strip, which it never did before. On native, every static step lowers to its own host under the same strip, instead of one frozen step. A pinned `timelineIndex` still renders exactly that step. The strip, its hit test and the stepping rules are one engine module shared by every target. (244fe91)
- The `<Chart>` API reference now names a common surprise: `title` labels the chart for screen readers and the accessible table, and `showTitle` draws it above the chart. (d5a7c06)
- The ECharts `toolbox` works on web and native. (244fe91)

  - `PlotChart toolbox` gains `magicType` stack / tiled, a box-select `dataZoom` with a back button, and a data view of the chart's table.
  - `OptionChart` reads `option.toolbox`.
  - On iOS and Android, every tool lowers onto the chart host. `saveAsImage` opens the share sheet, or hands `onSaveImage` a PNG data URL, on the plot host and on the family charts (pie, heatmap, sankey, …).
  - A custom `myTool`, whose `onclick` is a function, and a y-axis box zoom are named in a warning, not silently dropped.

  Also fixed:

  - Two charts on one native screen with zoom state no longer declare the same SwiftUI state twice.
  - `describeChart` no longer indexes past an empty category list, which crashed Android on a chart without categories.

- Two capability rows close, and the direct-native chart ledger is now at 100%. (244fe91)

  - `data.transforms`: the built-in `filter`/`sort` transforms and every dataset-chaining shape (`datasetIndex`/`datasetId`, `fromDatasetIndex`/`fromDatasetId`, `fromTransformResult`) already resolved at native compile time through the same `resolveDataset` the web runs — this was proven, not fixed, with a new chained (`fromDatasetIndex`) native compile test. A registered transform is an arbitrary JS closure that cannot run outside JS on any target, so it stays named as web-only rather than silently dropped.
  - `presentation.universal-transition`: `OptionChart` already forwarded ECharts' `universalTransition` to its shared canvas host, but `PlotChart` — the more common, array-of-marks API — never exposed the prop at all, so a real app could never reach it there. `PlotChart` now runs its own command-level morph for a series/row-count change (the same `cmd-tween.ts` machinery the canvas host uses), so a shape change tweens instead of snapping when `universalTransition` is set. Native's runtime canvas is shape-agnostic and already emitted the flag for both facades.

  Every row in the direct-native capability inventory (`CHART_CAPABILITY_CONTRACT`, now `.41`) is `'complete'`.

- A second value (or time) x axis maps on web and native: a series with `xAxisIndex: 1` is placed at its own x positions over that axis's domain, whose ticks and title sit on the opposite edge, and the accessible data table prints those positions. Native option charts also lower a value or time x axis at all — `[x, y]` pairs on a shared x — where they previously emitted nothing. (69391bd)
- The visualMap is interactive on web and native. A `calculable` continuous strip has two handles that drag the in-range interval, and a piecewise strip's swatches toggle their pieces. Values outside the selection take `inactiveColor` (`#ccc` by default). `range` and `selected` set the initial selection. The heatmap, calendar and map hosts draw the strip and own the gesture: `<HeatmapChart visualMap>`, `<CalendarChart visualMap>`, `<MapChart visualMap>` with `onVisualMapChange`, and an `OptionChart` visualMap over those series. Native builds the strip from the web's own `visualMapSpec` at compile time and keeps the selection in host state. The strip geometry, hit tests and colouring rule are one engine module shared by every target. (244fe91)
- `xAxis.inverse: true` runs the x axis right to left, on web and native. Category charts reverse every per-datum channel together, and hits still report the original datum index. A continuous x axis inverts through its domain. (69391bd)
- `yAxis.inverse: true` draws the value axis upside down, on web and native. The engine's `Domain` gained an `inverse` flag honoured by the linear scale, so marks, ticks and hit-testing all invert together. Stacked bars and filled areas now build their geometry through the scale, so they invert too. (69391bd)
- Update third-party dependencies to their latest compatible releases, (ea669a1)
  extending #3174's sweep to every package.json the first pass hadn't reached
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

- The map family gets the draw-list golden every other family already had (345493a)

  Counting hosts against `__goldens__/`: 19 chart hosts, 23 goldens, and exactly
  one family host with none — `map`. (`OptionChart` is the ECharts facade and is
  web-only by design.)

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

- feat(native): sma, ema and trend lower to iOS and Android (33388e8)

  The three indicator overlays cross into the native chart engine — `sma`, `ema`
  and `trend` emit real Swift and Kotlin rather than staying web-only, so a
  multiplatform chart carries the same indicator set as its web sibling. Charts'
  `engine/a11y.ts` gained the matching descriptions.

  (Recovered entry: this work shipped in #3403 with an EMPTY changeset, which the
  Changeset gate accepted because it counted activity by path with the content
  unread — so the feature had no CHANGELOG line at all. The gate now rejects a
  changeset that declares no package.)

- A literal `<OptionChart>` cartesian option now crosses to iOS and Android as the web facade compiled it. The spec fields ride the lowered chart: ECharts' default grid and its label containment, the axis label, line, tick and split-line rules, `onZero`, and the value-axis tick settings. So do the series fields: smoothing, `connectNulls`, area fills, label placement and the default symbols. The two targets read one interpretation of the option instead of two that drift. When the facade reads a key, the native lowering stops warning about it; an `axisLabel.formatter` (which cannot run at compile time) is still named. (896d747)

  Fixed on the way:

  - A native option series with a `null` datum now draws the gap instead of dropping the whole chart.
  - A negative number (`-2`) no longer makes an option read as non-literal.
  - A cartesian column with an integral first value and a fractional later one (`data: [1, 2.5]`) now compiles. Its rows had split into two struct types.

- Lower static pictorial-bar options to the native chart renderer on iOS and Android, including supported symbol shapes, repeated symbols, stacking, grouping, labels, colors, and patterns. Unsupported symbol shapes now produce a focused diagnostic and safely render as rectangles. (f2b1d43)
- Three reactivity/correctness fixes found by running `pyreon doctor` against the (02cae6a)
  framework itself, plus the rule-option support that made the remaining reports
  resolvable.

  - **`useChart` published a torn frame.** `instance.set(chart)`, `loading.set(false)`
    and `error.set(null)` ran unbatched, so a subscriber reading two of them saw
    the chart instance published while `loading` was still `true` — the "chart is
    ready but still showing a spinner" flicker. Batched into one notify cycle; the
    batch flushes before `onInit`, so the documented "fully configured before
    `onInit` fires" invariant is unchanged.

  - **Flow's `handlePointerUp` fired one notify cycle per selected node.** Its
    three branches (rubber-band / drag-end / connection-drop) are sequential and
    can co-occur, and the rubber-band branch calls `clearSelection()` plus
    `selectNode()` once per hit node — so a band over 100 nodes fired 100+ cycles
    and re-rendered the canvas each time. One pointerup is now one transition.

  - **`createActorId`'s fallback could collide.** The doc comment states two live
    peers must not share an id, but the non-`crypto.randomUUID` path was
    `Date.now()` + `Math.random()`, which repeats within a millisecond and is a
    birthday risk besides. It now prefers `crypto.getRandomValues` (far more widely
    available than `randomUUID`, which requires a secure context) and its last
    resort mixes in a per-process monotonic counter, so two ids from one process
    can never collide by construction and the random field only has to separate
    processes.

  - **`exemptPaths` on six rules that documented the convention but never read it.**
    `toast-a11y`, `no-href-navigation`, `no-inline-style-object`,
    `prefer-use-is-active`, `no-effect-in-mount` and `prefer-field-array` all
    inspect a call site, so the file that _implements_ the thing being recommended
    reports against itself — `link.tsx` renders the `<a href>` that `<Link>`
    wraps, and the toast row computes `role` from severity in its definition
    rather than at the `<ToastItem>` call site. Resolving that in-rule needs the
    parent chain, which oxc's visitor does not provide, so these now honour the
    documented `exemptPaths` option instead. Each still fires normally everywhere
    else.

- Stop publishing the build's bundle-analysis report. (5c60743)

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Harden webview host-HTML builders against a quote in developer-supplied (d259c0c)
  theme/color config breaking the generated page.

  `buildChartHostHtml` interpolated `theme` as a bare single-quoted JS string
  (`'${theme}'`) and `renderer` verbatim into the `echarts.init(...)` object
  literal — a theme name or renderer containing `'` broke out of the call.
  `buildFlowHostHtml` interpolated the `edgeColor`/`nodeFill`/`nodeStroke`/
  `labelColor` config into JS string literals and one `innerHTML` attribute the
  same way. These are developer configuration (never user data by design), so this
  is footgun-removal / correctness, not a user-facing vulnerability — but a color
  or theme name with a quote should not corrupt the page.

  Fix: `theme` is now `JSON.stringify`'d (a properly-escaped JS string literal),
  `renderer` is validated to the `'canvas' | 'svg'` enum, and the flow colors run
  through a `safeColor` allowlist (CSS-color tokens only) that neutralizes every
  interpolation site at once. Valid hex / `rgb()` / named colors are unaffected.

- A WebView host page that cannot start now tells the host (a0c4cd7)

  All three host pages already detected the failure — engine missing or never
  injected — set a `window.__pyreonXError` flag, and returned. That flag lives
  inside the very frame nobody on the host can read from, so every target rendered
  a blank box with the diagnosis stranded one origin away. On a device that is the
  hardest possible failure to debug.

  They now report it through the reverse bridge that was already there for
  ordinary events, as `{ error: "…" }`. The report retries briefly, because the
  host installs `pyreonPostMessage` on load and the page's own script runs first.

- A changed `html` now reloads a web-hosted page, as it already did on iOS and Android. The web `<WebView>` and the `FlowWebView`, `ChartWebView`, code and rich-text wrappers each read `html` once at setup, so a reactive swap kept the first page running forever. The new document gets the reverse bridge and the current `data` on load, the same as the first one. (411a373)
- Updated dependencies:
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
