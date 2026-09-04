# @pyreon/charts

## 0.52.0

### Minor Changes

- Boxplot family: `fiveNumber` (R-7 interpolated quartiles, Tukey 1.5-IQR fences, outliers), `boxplotExtent`, `renderBoxplot` (whiskers with caps, Q1–Q3 box, median line, outlier dots, entrance growing from the median), `hitBox`, `<BoxplotChart>` (reactive canvas host over raw observations, `onSelect`, accessible summary table), `boxplotToSvg` (server-safe, accepts precomputed summaries), and the option facade maps `type: 'boxplot'` (ECharts' `[min, Q1, median, Q3, max]` tuples, with a companion `scatter` series read as outliers). Conformance corpus 18 → 19, floor 16 → 17. (5dca722)
- Calendar family: `layoutCalendar` (a day-per-cell grid over an ISO date range — weekday rows with `firstDay` rotation, week columns, month labels at each month's first column, alternating weekday labels, fit-to-box or fixed `cellSize`; strict ISO parsing that rejects impossible dates), `renderCalendar` (values through the shared heat ramp with a data or fixed `domain`, `emptyColor` for days without data, week-by-week entrance), `hitCalendar`, `<CalendarChart>` (reactive canvas host, `onSelect(cell)`, accessible table), `calendarToSvg` (server-safe), and the option facade maps a `heatmap` series on `coordinateSystem: 'calendar'` (`calendar.range` as year / `YYYY-MM` / date / `[start, end]`, `cellSize`, `dayLabel.firstDay`, `dayLabel.show`, `monthLabel.show`, `visualMap` colours + min/max; `orient: 'vertical'` warns; a malformed datum warns by index). Conformance corpus 23 → 24, floor 21 → 22. (e2e40da)
- Custom series in the option facade: `type: 'custom'` with ECharts' `renderItem(params, api)` — `api.value` / `api.coord` / `api.size` / `api.style` / `api.visual` map data to pixels through the chart's own layout, returned elements lower through the same graphic vocabulary as the `graphic` option (rect, circle, line, polygon, polyline, text, group), `encode.x` / `encode.y` feed the axis extents, `null` items are skipped and a throwing `renderItem` warns per datum. `customCommands` is exported for hosts. Conformance corpus 31 → 32, floor 29 → 30. (fea7fde)
- `dataset.transform` in the option facade's dataset pre-pass: `filter` (comparison conditions — `gt`/`gte`/`lt`/`lte`/`eq`/`ne` and their symbol spellings — composed with `and` / `or` / `not`), `sort` (one key or several, `asc`/`desc`, numeric or string), chained transforms per dataset, and `fromDatasetIndex` so derived datasets build on each other; series pick a derived dataset with `datasetIndex`. Unknown transform types and dimensions warn by name and pass the table through unchanged. Conformance corpus 29 → 30, floor 27 → 28. (05f4b35)
- dataZoom + brush on `PlotChart` (ECharts' inside dataZoom + brush select). `dataZoom` adds wheel-zoom that keeps the datum under the cursor fixed, drag-pan by plot-widths, and double-click reset; `brush` adds drag-selection reporting a GLOBAL inclusive datum range through `onBrush` (Shift+drag when both gestures are on), with a persistent highlight band cleared by the next click (`onBrush(null)`). The window is a fraction pair over the data (`zoom.ts` — pure, host-agnostic math: `zoomWindow`/`panWindow`/`sliceRange`/`brushRange`), and the host slices rows through it, so geometry, hit-testing, tooltips and the accessible table stay correct with zero engine awareness. Accessors and callbacks always see GLOBAL indices — a zoom never renumbers your data. The wheel is captured (preventDefault) over a zoomable plot; drags suppress the click so panning never fires `onSelect`. (524c7b1)
- Dual y-axes at the engine level. A mark opts in with `axis: 'right'` (`MarkOptions.axis`, carried onto `Series.axis`); the right domain derives from right-axis series or pins via `ChartSpec.y2Domain`/`ChartToSvgOptions.y2Domain`, with its own `y2Format`. The right gutter is measured from the y2 tick labels exactly like the left one, the right axis line + `start`-aligned labels render when a right series exists, and each independent series scales against ITS axis. Three deliberate pins, none silent: stacked/grouped stay left (one stack, one scale), horizontal frames stay single-axis, and a chart whose EVERY series is right falls back to left. `chartToSvg` carries the options, so dual-axis charts work server-side today; the `PlotChart` prop plumb follows once the interaction wave lands. (17596f4)
- Two cartesian variants in the engine: `Series.effect` draws two translucent halo rings under every point (the effectScatter look, frozen at a frame and scaled with the entrance), and `Series.symbol` + `symbolRepeat` draw bars as a stretched or repeated symbol (`rect` / `circle` / `diamond` / `triangle` — the pictorialBar look, repeating along the bar's own axis and dropping a partial last unit). Exposed on the mark options (`points(y, { effect })`, `bars(y, { symbol, symbolRepeat })`) and mapped by the option facade (`type: 'effectScatter'`, `type: 'pictorialBar'` incl. `stack`/grouped; a path or image symbol falls back to a rect with a warning). The generated native chart engine carries both. Conformance corpus 30 → 31, floor 28 → 29. (05f4b35)
- `<GanttChart>` + `layoutGantt` / `renderGantt` / `hitGantt` / `ganttToSvg` — the Gantt family: one row per task on a calendar-aligned time axis (day/week/month/quarter/year ticks picked by span), lane headers per group, progress insets, milestone diamonds, dependency elbows, a dashed today marker, an entrance progress, and the same reactive canvas host + accessible table as every other family. (6ea2c9c)
- Server-side SVG for the whole chart family: `pieToSvg`, `gaugeToSvg`, `radarToSvg`, `candlestickToSvg` and `heatmapToSvg` join `chartToSvg` — pure functions over the engine's geometry with `measureApprox` by default, so every chart type renders in an SSG build, a serverless function or an email pipeline, with the same derived accessible title/description contract. (17c081a)
- The finance family joins the interaction contract: `CandlestickChart` gains `onSelect` (candle index; the full column is the hit target, because a wick is one pixel wide) and an OHLC `tooltip`; `HeatmapChart` gains `onSelect` (the tapped CELL — categories plus aggregated value, null for a miss, and an undrawn cell IS a miss because absence is not selectable) and a cell `tooltip`. New pure hit helpers `hitCandle` and `hitHeatCell` ship from the engine, so the same geometry answers native hosts. (a7bc895)
- Funnel family: `layoutFunnel`/`renderFunnel`/`hitFunnel` (pure trapezoid geometry — descending/ascending/none sort that still names INPUT indices, per-stage taper toward the next stage, `minWidthRatio`, left/center/right alignment, entrance progress), `<FunnelChart>` (reactive canvas host with `onSelect` and the accessible table), `funnelToSvg` (server-safe), and the option facade maps `type: 'funnel'` (`sort`, `minSize`, `funnelAlign`, labels). Conformance corpus 17 → 18, floor 15 → 16. (33b353b)
- Points and paths on a map: `renderGeoPoints` + `renderGeoPaths` / `hitGeoPoint` / `geoPointRadii` / `geoPointsToSvg` draw scatter and effectScatter symbols through a map layout's projection (value-scaled radii, halo rings, opt-in labels), and the option facade routes `scatter` / `effectScatter` / `lines` with `coordinateSystem: 'geo'` over the top-level `geo: { map, itemStyle }` (`[lon, lat, value]` data, `symbolSize`, per-point colours; other series types on geo warn by name). Conformance corpus 35 → 36, floor 33 → 34. (fea7fde)
- Graph family: `layoutGraph` (DETERMINISTIC force layout — seeded PRNG, Fruchterman–Reingold repulsion/attraction with gravity and cooling, symbols clamped inside the box; `circular` and `none` (data coordinates) layouts; symbol radius by value; category colours; unknown-endpoint links dropped BY NAME), `renderGraph` (links width-by-value under symbols, opt-in labels, entrance converging from the centre), `hitGraph`, `<GraphChart>` (reactive canvas host, `onSelect(node)`, accessible table), `graphToSvg` (server-safe), and the option facade maps `type: 'graph'` (`data`/`nodes` with id/name/value/category/x/y, `links`/`edges` by name or index, `categories`, `layout`, `symbolSize`, `force.repulsion/edgeLength/gravity`, `label.show`; a `symbolSize` FUNCTION warns). Conformance corpus 22 → 23, floor 20 → 21. (5346f90)
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

- Horizontal bars: `<PlotChart horizontal>` puts categories on the Y axis with (185739d)
  the left gutter sized by the widest category label (long names are the reason
  horizontal bars exist), grows bars rightward from the zero line — negative
  values leftward, the entrance animation included — and keeps the value
  formatter on the X axis. Bar marks only; non-bar marks are skipped rather
  than drawn as a misleading transpose. `chartToSvg` takes the same option.
- `<PlotChart>` host wave: keyboard navigation (the canvas is focusable; Left/Right/Up/Down move a focus datum drawn with a focus ring and announced in a polite live region, Home/End jump, Enter/Space fire `onSelect`, Escape clears — on by default, `keyboard={false}` opts out), update animation (a data change of the same shape tweens from the previous frame to the new one through the pure `tweenValues` helper, `updateAnimation`/`updateDuration`, reduced-motion aware), and `zoomPresets` (Highcharts-style range-selector buttons under the plot that set the dataZoom window to the last N rows). The canvas exposes `data-pyreon-zoom` and `data-pyreon-presets` as stable hooks. (6ea2c9c)
- Gaps and technical indicators. A non-finite series value is now a GAP: lines and areas break into runs at the gap (ECharts' `connectNulls: false`), points draw nothing there, and derived domains ignore it — the option facade maps `null` and `'-'` data to gaps silently instead of zeroing with a warning. `Mark.transform` derives a whole series from the resolved values, and `sma`, `ema`, `bollinger` (three marks: upper/middle/lower) and `trend` (least squares) ship as line marks whose warm-up positions are gaps, so an indicator starts where it is defined. Pure, Double-only math — lowers to native. (c50c972)
- Interaction wave for the plot engine: legend entries are now click-to-toggle (on by default with `showLegend`, opt out with `legendToggle: false`) — the domain rescales to the visible series, hidden entries render muted at their own hue, and the accessible table keeps every series because hiding is a visual focus tool, not a data edit. New `crosshair` prop draws a dashed rule through the hovered datum's column with a marker on each visible line/area/points series. `renderLegend` returns per-entry hit `boxes` and honours a `muted` flag on entries. (78e6bd0)
- Scrollable legend + title block. `renderLegend` gains `maxRows` and `page`: a legend that overflows the cap shows `maxRows` rows and a right-aligned pager (prev / current-of-total / next) whose arrows come back as hit rects in `LegendLayout.pager`; the second layout pass reserves the pager's width so the last visible row never runs under it, entries on other pages are not drawn and keep an EMPTY hit rect (w = -1) so `boxes` stays index-aligned, and an uncapped legend renders byte-identically to before. New `renderTitle(text, subtitle, box, opts)` lays out a title and optional sub-title block (start/middle/end alignment) and reports the height it consumed — the legend's contract — so a host shrinks the plot by exactly what was drawn. (b57c99f)
- `lines` series in the option facade (cartesian): each datum's `coords` (or a bare `[[x, y], …]` array) becomes a polyline through the chart's pixel api, with `lineStyle.width` / `color` at series or datum level, axes seeded from every vertex; a datum without coords warns by index, and `effect` (animated trails) warns by name. Lowered as an internal custom plan, so `customCommands` serves hosts. Conformance corpus 32 → 33, floor 30 → 31. (fea7fde)
- Linked charts (ECharts `connect`): `createChartLink()` returns a shared `{ zoom, hover }` pair; pass it as `<PlotChart link>` to every chart in a group and wheel-zoom, pan, navigator drags, presets and the crosshair datum stay in sync across all of them. The host exposes `data-pyreon-hover` beside `data-pyreon-zoom`. (6ea2c9c)
- Map family: `registerMap` / `getMap` / `listMaps` (ECharts' registry shape over GeoJSON FeatureCollections), `projectLonLat` (equirectangular or Mercator with polar clamping), `layoutGeo` (Polygon + MultiPolygon outer rings projected and fitted into a box with aspect preserved, north up, area-weighted centroids, per-region bboxes, a reusable `project` for overlays), `geoDomain`, `renderGeo` (fills through the shared heat ramp with a data or `visualMap` domain, an empty colour for regions without data, borders, labels only where they fit, fade-in entrance), `hitGeo` (bbox then point-in-ring), `<MapChart>` (reactive canvas host over a GeoJSON or a registered name, `onSelect(region)`, accessible table), `geoToSvg` (server-safe), and the option facade maps `type: 'map'` (`map` name, `{ name, value }` data, `visualMap`, `label.show`, `itemStyle.borderColor/Width`, `nameProperty`; an unregistered map and `roam` warn by name). Conformance corpus 34 → 35, floor 32 → 33. (fea7fde)
- Datum-anchored point markers — ECharts' markPoint, engine-shaped. `ChartSpec.markers` / `ChartToSvgOptions.markers` take `PointMarker[]`: anchor at a series' `'max'`/`'min'` or a concrete `atIndex` (clamped), with label above the point, colour/radius defaulting to the series' own. Markers draw OVER the series in painter's order, grow with the entrance `progress`, scale against the series' OWN axis (a right-axis series marks on the right domain), and skip joint layouts (stacked/grouped) and the horizontal frame rather than guessing — a marker with no anchor is skipped, the Annotation precedent. The anchor is split into two fields (`at` + `atIndex`) rather than one mixed string/number union deliberately: the split keeps the engine inside the native-compilable subset at zero caller cost. (7da8b03)
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
- The candlestick and heatmap frames move into the engine — `candlestickFrame` / `renderCandlestickChart` / `hitCandlestickChart` and `heatGridFrom` / `heatPlotFor` / `renderHeatChart` / `hitHeatChart` (exported from `@pyreon/charts/plot`) — so the web hosts and the native canvas paint the SAME command list; both modules cross into the generated native engine. The native runtimes gain `pyreonChartMeasure` (UIKit / `Paint` text width in engine units), the measurer a laid-out frame needs. `<CandlestickChart>`, `<HeatmapChart>` and `<RadarChart>` lower to native (accessor bodies inlined; a `theme` override, a cell-shaped heatmap `onSelect` and `showLegend` warn by name). (8d1ff30)
- `onSelectIndex` — selection on the family hosts in the form that crosses to native. Every lowered host (`<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`) takes `onSelectIndex`, which receives the engine's INDEX hit (`SankeyHitIndex` `{ node, link }`, `PolarHitIndex`, or a plain index with -1 for a miss) beside the web-shaped `onSelect`. On the web it fires from the same click; on iOS/Android the compiler lowers it to a tap gesture (`DragGesture(minimumDistance: 0)` / `detectTapGestures`) that hit-tests the same layout the canvas painted — the tap position divided by the display density on Android, where the draw list is laid out in dp. New engine exports `hitTreemapIndex`, `hitSunburstIndex`, `hitTreeIndex`, `hitRiverIndex` (the existing object-returning hits now wrap them); `@pyreon/native-cli` adds the `detectTapGestures` / `LocalDensity` Kotlin imports when the emit uses them. (8d1ff30)
- The legend and title blocks draw natively. `renderLegend` is rewritten in the crossing subset (`legendPlan` is a named top-level plan; `LegendPager.prev` / `next` are plain rects guarded by `hasPrev` / `hasNext` instead of `Rect | null`; the page label goes through `plain`), and it crosses into the generated engine together with `renderTitle`. The native runtimes gain `pyreonShiftCmds(cmds, dy)` — the web hosts' `shiftCmd`, which sits the plot below the chrome. `<PlotChart showLegend showTitle subtitle legendMaxRows>`, `<PieChart showLegend>` and `<RadarChart showLegend>` now emit the title block, the legend, and the plot translated down by both, with the tap offset to match; a host without the flags emits exactly what it did before. (8d1ff30)
- `<PlotChart marks>` — the cartesian family — lowers to native. Each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points`, literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `renderChart` paints it; `onSelect` taps the new engine `plotHitBars`, which the web host's click now uses too (`plotHitIndex` for its tooltip), exported from `@pyreon/charts/plot` and crossing into the native engine. A `bubble` mark, a `curve` option, the legend / title / zoom / brush / navigator surfaces, formatters and a `theme` override warn by name. (8d1ff30)
- The remaining `<PlotChart>` inputs lower to native: a literal `theme={{ … }}` merges over the default theme (Candlestick and Heatmap hosts too); `format` / `xFormat` / `y2Format` lower as the engine's formatter by name (`compact`), a factory call (`fixed(1)`, `currency`, `percent`) or a closure; a `bubble` mark carries area-mapped radii through the new engine `bubbleRadii` (which `resolveMarks` now uses on the web). What still warns by name on native: `dataZoom`, `brush`, `navigator`, `zoomPresets`. (8d1ff30)
- Engine: `formatTime` is now pure UTC epoch math (civil-from-days) instead of local-time `Date` getters — one shared source labels the same timestamp identically on web, iOS and Android, and the function lowers under PMTC (`new Date` is a class-construction bail). This changes default time-axis labels from device-local time to UTC; a locale/zone-aware label remains a `Formatter` the caller supplies. Also: `timeTicks` binds its formatter coalesce-first (an optional closure call does not narrow through a ternary in Swift), `fitCircle` returns a NAMED `Circle` type (an inline object return annotation lowers to a mismatched tuple), and locals that shadowed `Math.max`/`Math.min` call names are renamed (Swift scoping rejects the shadow JS allows). (c6b2fb6)
- `<PlotChart zoomPresets>` lowers natively. The preset strip is now an engine module (`presets.ts`: `renderPresets` / `presetHit` / `presetWindow` / `presetIsActive`) that the web host consumes — the strip it paints is byte-identical — and that generates into `PyreonChartEngine.swift/.kt`, so iOS and Android lay out and hit-test the same buttons. On native a tap on a preset writes the host's window (re-anchoring an active pinch when `dataZoom` is on too); presets bring the window state with them even without `dataZoom`. A non-literal `zoomPresets` value warns by name and renders the chart without the strip. (8d1ff30)
- `<PlotChart navigator>` — the slider dataZoom: a strip under the plot shows the first series over ALL rows with the zoom window as a band; drag the band to move the window, drag a handle to resize it (window math shared with the wheel/pan zoom, minimum span enforced). Works with or without the inside `dataZoom`; the strip rect is exposed as `data-pyreon-nav`. (6ea2c9c)
- `<OptionChart>` mounts a family option (pie, gauge, radar, candlestick, heatmap, funnel, treemap, sunburst, tree, sankey, graph, calendar, parallel, polar, themeRiver, map) on the family's OWN canvas host — hit-testing, reactive repaint and the accessible table included — via the new `familyHostNode(plan, { width, height, onSelect })`; the host's hit arrives on `onFamilySelect(kind, hit)`. Only the two host-less shapes (geo points, single axis) still render as SVG. (61fea37)
- `<OptionChart option>` — the ECharts-option-driven reactive host: pass an ECharts-shaped option (value or accessor) and get a live canvas chart with click hit-testing (`onSelect` → `{ seriesIndex, dataIndex, name, value }`), `theme` / `locale`, a driven or auto-playing `timeline` (`timelineIndex`, `onTimelineChange`), multi-`grid` composition, and the accessible table; family and geo options render through the same facade as SVG. `compiledCommands` (the composed picture of a compiled cartesian option as flat commands) is exported so `optionToSvg` and the host paint one geometry. (61fea37)
- ECharts option-compat facade. `compileOption(option)` accepts an ECharts-shaped option and compiles it onto the plot engine — bar / stacked / grouped / line / area / step / smooth / scatter series (number, `{value}` and `[x, y]` pair data), category / value / time x axes, one or two y axes (`yAxisIndex: 1` → the right axis, `min`/`max` → pinned domains, function and `{value}`-template formatters), `markLine` (average/max/min, yAxis, xAxis) → annotations, `markPoint` (max/min, coord) → markers, `color` palette, `itemStyle`/`lineStyle` colours, `title`/`legend`/`tooltip` host hints. Nothing is dropped silently: every unmapped key, series option, series type or data shape becomes a named `OptionWarning` with a path, and an unmappable series flips `supported` to false. `optionToSvg(option)` composes title + legend + chart into a server-safe `<svg>` string. A gallery-shaped conformance corpus is the parity metric — its clean pass count is locked as a floor that only ratchets up. (7da8b03)
- The option facade's family half: pie (radius pair → donut hole, per-slice itemStyle colours, label.show, legend), gauge (min/max, detail.show, progress/itemStyle colour, axisLine width), radar (`radar.indicator` → axes, areaStyle opacity, multi-series), candlestick (ECharts' `[open, close, low, high]` tuples, itemStyle color/color0), heatmap (`[xIndex, yIndex, value]` triples over category axes, `visualMap.inRange.color` ramp). `planOption` routes any option to the right half; `optionToSvg` renders every family through the family SVG helpers. The conformance corpus grows to 17 gallery-shaped fixtures with a floor of 15 clean. (6f9eece)
- Option-level layers for the ECharts facade: `resolveDataset` (the `dataset` pre-pass — array sources with auto/explicit `sourceHeader`, object sources, `dimensions`, `seriesLayoutBy: 'row'`, `encode` by name or index, `datasetIndex`; materialises category `xAxis.data` plus per-series data as values, `[x, y]` pairs for scatter, or `{ name, value }` items for the name-value families; never mutates the input; transforms warn by name) wired into BOTH facade halves, and `graphicCommands` (the `graphic` layer — text / rect / circle / line / polygon / polyline / group with `x`/`y`, `left`/`top`/`right`/`bottom`, percentages and `center`; unsupported types warn by name) appended above the chart in `optionToSvg` for cartesian and family options alike (`appendGraphicLayer` splices into a rendered `<svg>`). Conformance corpus 27 → 28, floor 25 → 26. (05f4b35)
- ECharts facade: `timeline` (`baseOption` + `options[]` steps — series merged by index, a strip with one dot per step under the chart, `timelineIndex` to pick a step, out-of-range steps warn `timeline-step-out-of-range`) and multi-`grid` layouts (`gridRect` px/% parsing, axes and series assigned by `gridIndex`/`xAxisIndex`, one sub-chart per grid composed into ONE `<svg>`; `planOption` returns `{ kind: 'grids' }`). Pure functions in `option-composite.ts`. (6ea2c9c)
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
- Polar coordinate: `layoutPolar` (categories on the ANGLE axis → radial bars in equal slots, grouped side by side or stacked along the radius, plus polar lines at slot centres; categories on the RADIUS axis → concentric arc bars sweeping by value; hole via `innerRatio`, `startAngle`, `clockwise`, fixed or data value domain, nice ticks), `renderPolar` (grid rings/spokes, sectors via the shared arc tessellation, lines + points, rim labels, entrance that grows bars and draws lines), `hitPolar` (sector, then nearest line point), `<PolarChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `polarToSvg` (server-safe), and the option facade routes `bar`/`line` series with `coordinateSystem: 'polar'` (top-level `polar.radius`, `angleAxis`/`radiusAxis` category + `min`/`max` + `startAngle` + `clockwise`, per-series `stack`/`itemStyle.color`; any other series type on the polar coordinate warns). Conformance corpus 25 → 26, floor 23 → 24. (bbf1800)
- `<RadarChart>` joins the plot engine's component family — one polygon per datum over shared spokes, each axis normalised by its own max so mixed-unit axes stay comparable. Ships with the same accessibility contract as its siblings (derived `aria-label` + offscreen data table), an optional wrapping legend, translucent fills with full-strength outlines, and the shared radial host sizing (parent-measured width + resize observer), which is now extracted to one module so the pie/gauge/radar trio cannot drift apart again. (559e5f7)
- `<PieChart>` and `<GaugeChart>` from `@pyreon/charts/plot` cross to native: PMTC lowers them to the new runtime `PyreonPieChart` / `PyreonGaugeChart` views (SwiftUI + Compose), drawn by the generated `PyreonChartEngine` — web and native render the same byte-locked geometry. Accessor props pass through as closures (the wrappers are generic over the row type, with `Number`/`Int` seams for integer columns), `data-testid` + a11y ride the special-emitter tail, and the decline paths warn by name (an `(d, index)` accessor, missing required props, the web-only legend/hit-testing surface). The charts manifest now declares `nativeFrontend`, so subpath imports of the web-only components (`PlotChart`, heatmap, candlestick) get the per-package advice instead of silence — the symbol-level warn table lookup is root-normalized (`@pyreon/charts/plot` matches the `@pyreon/charts` entry; the `/webview` bridge stays exempt). (f22774f)

  The diagnose catalog teaches the unlowered-chart-tag error: `cannot find 'PieChart' in scope` / `Unresolved reference 'PlotChart'` now explains the radial decline paths and the web-only cartesian family, with the `<Web>`/webview remedies.

- Sankey family: `layoutSankey` (columns by longest path with cycle back-edges, self-loops and unknown endpoints dropped BY NAME rather than silently; node bands sized by max(in, out) at one shared scale; weighted-centre relaxation with collision resolution; `nodeWidth`, `nodePadding`, `iterations`, `align: 'left' | 'justify'`), `ribbonPoints` (S-curve ribbons stacked so they never cross at a node, entrance growing from the source), `renderSankey`, `hitSankey` (band, then ribbon via point-in-polygon), `<SankeyChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `sankeyToSvg` (server-safe), and the option facade maps `type: 'sankey'` (`data`/`nodes` + `links`/`edges`, `nodeWidth`, `nodeGap`, `nodeAlign`, `layoutIterations`, `label.show`; `orient: 'vertical'` warns). Conformance corpus 21 → 22, floor 19 → 20. (5346f90)
- Single-axis coordinate: `layoutSingleAxis` (one horizontal category or value axis with nice ticks, points placed along it and sized by a second dimension), `renderSingleAxis`, `hitSingleAxis`, `singleAxisToSvg` (server-safe), and the option facade routes `scatter` with `coordinateSystem: 'singleAxis'` over the top-level `singleAxis` (`type`, `data`, `min`/`max`, `name`; `[position, size]` or scalar data, `symbolSize`, labels, colours; other series types warn by name). Conformance corpus 36 → 37, floor 34 → 35. (fea7fde)
- `sonifyValues(values, options)` — a series as sound: values map linearly to pitch (`minHz..maxHz`), an oscillator steps through them over `duration`, gaps play as silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair along with the audio. Injectable `AudioContext`; `play()` resolves when done or on `stop()`. (6ea2c9c)
- Sunburst family: `layoutSunburst` (radial partition — one ring per depth, sibling spans proportional to value inside the parent's span, `padAngle`, `maxDepth`, `sort: 'desc' | 'none'`, `startAngle`, stable child-index paths, inherited colours tinted per ring), `renderSunburst` (arc bands via the shared polygon tessellation, labels only where the chord fits, clockwise entrance sweep), `hitSunburst` (deepest arc, hole-aware, wraps past 12 o'clock), `<SunburstChart>` (reactive canvas host, `innerRatio`, `onSelect(arc)`, accessible leaf table), `sunburstToSvg` (server-safe), and the option facade maps `type: 'sunburst'` (nested data, `radius: [inner, outer]` → hole ratio, `sort: null`, `startAngle` degrees, `label.show`, per-node `itemStyle.color`). Conformance corpus 19 → 20, floor 17 → 18. (5346f90)
- Theme registry and locale packs for the option facade: `registerTheme` / `getTheme` / `listThemes` / `resolveTheme` over an ECharts-shaped `ThemeDefinition` (palette, background, text colour + size, axis and grid colours; `light` and `dark` built in), applied via `compileOption(option, { theme })` — series without an explicit colour take the palette, the spec takes the text/axis/grid colours, and `optionToSvg` paints the background; an unknown name warns and falls back. `registerLocale` / `getLocale` / `numberFormatter` / `dateFormatter` over Intl with optional packs (number options, date options, month names), applied via `{ locale }` to value-axis labels and time-axis labels unless the option carries its own formatter. (fea7fde)
- Theme-river family (streamgraph): `layoutRiver` (layers stacked without gaps on a symmetric `silhouette` baseline or a `zero` baseline, missing values as 0, widest-point label anchors, category ticks), `smoothPoints` (Catmull–Rom sampling) + `layerPolygon`, `renderRiver` (layers back to front, axis, labels only where the layer is thick enough, left-to-right entrance), `hitRiver` (front-most layer under the point), `<RiverChart>` (reactive canvas host, `onSelect(layer)`, accessible table), `riverToSvg` (server-safe), and the option facade maps `type: 'themeRiver'` (`[date, value, name]` triples grouped into streams over the sorted date axis, `singleAxis`, `label.show`; a malformed triple warns by index). Conformance corpus 26 → 27, floor 24 → 25. (05f4b35)
- Toolbox on `PlotChart` (ECharts' `toolbox`): `saveAsImage` exports the current frame as an SVG through the engine's own serializer (download, or `onSaveImage(svg)` for custom handling), `restore` resets zoom, brush, legend toggles, legend page and any magicType override, and `magicType: ['line', 'bar']` retypes the independent marks (stacked/grouped/points keep their geometry). `toolbox.ts` is a pure layout (`renderToolbox`/`hitToolbox`/`toolboxTools`) with the legend's hit-rect contract. (8d1ff30)
- Tree family: `layoutTree` (tidy node-link layout — every leaf takes one slot, parents centre over their leaves; `orient: 'LR' | 'RL' | 'TB' | 'BT' | 'radial'`, `maxDepth`, a label gutter, stable child-index paths, inherited colours), `linkPoints` (smooth S-curves, orthogonal elbows, straight radial spokes), `renderTree` (links → symbols → outward leaf labels / inward inner labels, root-first entrance), `hitTree` (nearest symbol within a halo), `<TreeChart>` (reactive canvas host, `onSelect(node)`, accessible table), `treeToSvg` (server-safe), and the option facade maps `type: 'tree'` (`orient`/`layout: 'radial'`, `symbolSize`, `initialTreeDepth`, `edgeShape: 'polyline'` → elbow, `label.show`, per-node `itemStyle.color`). Conformance corpus 20 → 21, floor 18 → 19. (5346f90)
- Treemap family: `layoutTreemap` (squarified layout of a value hierarchy — Bruls/Huizing/van Wijk rows, padded nesting, `maxDepth`, stable child-index paths, inherited colours tinted per depth), `renderTreemap` (fills per depth, leaf labels only where they fit, entrance scaling), `hitTreemap` (deepest cell), `<TreemapChart>` (reactive canvas host, `onSelect(cell)`, accessible leaf table), `treemapToSvg` (server-safe), and the option facade maps `type: 'treemap'` (nested `{ name, value, children }` data, `leafDepth`, `label.show`, per-node `itemStyle.color`). Conformance corpus 18 → 19, floor 16 → 17. (5346f90)
- visualMap component: `visualMapSpec` (reads `visualMap` — `inRange.color` stops, `min`/`max` or the first series' data extent, `type: 'continuous' | 'piecewise'` with explicit `pieces`, `categories`, or `splitNumber`, `orient`, `text`, `itemWidth`/`itemHeight`, `show: false`; `calculable` warns), `renderVisualMap` (a 24-stripe ramp strip with end labels, or swatches + labels, vertical or horizontal, reporting its size), `domainFromSeries`, and `visualMapCommands` (placed by `left`/`right`/`top`/`bottom`, ECharts' bottom-left default) — appended above the chart in `optionToSvg` for both facade halves and exported for hosts. Conformance corpus 28 → 29, floor 26 → 27. (05f4b35)

### Patch Changes

- Docs: manifest entries for `<OptionChart>`, `<GanttChart>`, `createChartLink` and `sonifyValues` (MCP `get_api`, llms), an Interaction section (dataZoom, navigator, zoom presets, keyboard, update animation, linked charts), Gantt, sonification and option-host sections on the plot docs page, and the README. (61fea37)
- Engine: hex color decoding (radar's `withAlpha`, heat's ramp channel reader) now uses `charCodeAt` arithmetic instead of String Int-subscripts and `parseInt` radix — byte-identical rgba/rgb output on web (full test suite green), and the shapes Swift rejects outright ("cannot subscript String with an Int") are gone from the native draw-pipeline bundle. (f727234)
- Hit-test stacked and grouped bars, size the radial charts to their container, escape `idPrefix` (78de81b)

  **`onSelect` was permanently dead for `stacked` and `grouped` bars.** The hit test bailed on `kind !== 'bars'` behind a comment excusing "a line/area chart" — but stacked and grouped _are_ bar marks that draw real rects, so every click reported `-1` while `onSelect`'s own JSDoc says it fires "with the datum index when a bar is tapped". The tooltip shared the same bail, so it never appeared over those charts either. `layoutStackedBars` / `layoutGroupedBars` were already public; they simply were not asked, because those series are laid out TOGETHER (each needs the others to place its bars) and so cannot be queried one series at a time the way `barsFor` does. `stackedHitAt` asks them as a set and returns the datum index, matching what a plain bar series reports.

  **`<PieChart>` and `<GaugeChart>` pinned themselves at mount width.** They read `el.clientWidth`, and `prepareCanvas` writes an inline `canvas.style.width` — so the first measurement is what every later read returns, and the chart stays that size forever. `<PlotChart>` measures the PARENT and observes it with a `ResizeObserver`, and its own comment documents this exact failure ("pinned at that fallback forever — 300px inside a 430px column, with nothing in the DOM looking wrong"); the radial family never got either half, while the documented example passes no `width`. The `?? 300` in that expression was dead code too — `clientWidth` is always a number. An explicit `width` still wins, and the observer is guarded against the feedback loop the draw itself causes.

  **`renderSvg`'s `idPrefix` was interpolated unescaped** into the root `<svg>`'s `id` and `aria-labelledby`, so a prefix of `a" onload="…` put a live handler on the element. It was the one interpolated option without `esc()` — eleven lines above `background`, which has it. The manifest tells callers to vary the prefix per chart, which is where a data-derived value comes from.

  **The WebView host builder** gets the same two escape fixes the other three packages received: `<style>` is raw text so `&quot;` was inert there and `</style>` in a `background` closed the element; and `</` → `<\/` alone does not stop the tokenizer entering the script-data-double-escaped state on `<!--`, where the page's own `</script>` no longer ends the element.

  Also restores `@pyreon/charts` to its declared 98% branch threshold. The package had been measuring 96.47%, which was invisible until the coverage gate began comparing every threshold a package declares rather than statements alone — at which point a pre-existing shortfall turned the gate red for every PR whose affected set reaches charts, which is any compiler change. The gap is closed with real assertions on what gets DRAWN (a reversed annotation band, a coloured rule, a rule with no label, a bubble whose radius array has a hole, an all-zero r channel, a malformed colour stop), not by lowering the number.

- `logTicks` walks its exponent range with a `while` loop instead of a compound-condition `for` head. Web behavior is byte-identical; the change keeps the function inside PMTC's canonical loop subset so the native-emitted engine retains the loop body instead of warn-dropping it. (6599ad9)
- `<FunnelChart>`, `<PieChart>` and `<GaugeChart>` lower to native. The accessor-prop hosts map their rows through the accessor bodies INLINED into one closure (`rows.enumerated().map { (i, d) in FunnelStage(value: Double(d.total), label: d.name, color: …) }` / `mapIndexed`), with the shared palette for an absent `color`; a block-bodied accessor warns by name. `onSelect` (already an index on these hosts) and `onSelectIndex` lower to the tap over `hitFunnel` / `hitArc`. `<GaugeChart>` lowers with its fixed half-circle box and the value text; `<PieChart showLegend>` renders without the legend and says so. README: the native-geometry section lists them. (8d1ff30)
- The candlestick and heatmap geometry join the generated native chart engine (`PyreonChartEngine.swift` / `.kt`): `ohlcExtent`, `renderCandles`, `buildHeatGrid`, `colorRamp`, `HEAT_RAMP` and `renderHeat` now lower with zero transform warnings and compile on both toolchains. Two engine-side idioms made it possible with no behavior change on web: `renderCandles` takes an OPTIONAL options object (an empty-object-literal default has no native lowering) and `buildHeatGrid` keys its aggregation map by an INDEX into the cells array (a Map with a struct value has no native lowering). (e669817)
- Docs: the README gains a "Native geometry" section stating that every `@pyreon/charts/plot` family is generated into `PyreonChartEngine.swift` / `.kt`, which API shapes exist because of the crossing (index hits, `{ min, max }` domains, ISO/day dates, `rampColor`, `calendarValues`, `parallelRows`, the seeded LCG), and what stays web-only (hosts, gestures, sonification, the tween, the option facade); the manifest's multiplatform rationale says the same, and the derived web-only rationale in `@pyreon/compiler`'s native audit and `@pyreon/native-compiler`'s web-only warning carries the same text. (8d1ff30)
- `@pyreon/charts/plot` family hosts lower to native. `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>` and `<PolarChart>` — the hosts whose props are plain data — now emit `PyreonChartCanvas` over the generated engine (`renderX(layoutX(...))` with the web host's own box arithmetic), sized by a `GeometryReader` / `BoxWithConstraints` or by `width` / `height`, with `title` as the accessibility label and `data-testid` as the identifier. The accessor-prop hosts (`PlotChart`, `PieChart`, `GaugeChart`, `RadarChart`, `FunnelChart`, `HeatmapChart`, `CandlestickChart`), `CalendarChart` (a record) and `ParallelChart` (mixed rows) warn BY NAME on native instead of naming a view that does not exist. Importing from `@pyreon/charts/plot` no longer raises the package's web-only warning (that rationale is about the ECharts bridge at the root). The Swift/Kotlin stub typecheck links the REAL generated engine when a chart host is present. `PyreonChartCanvas.kt` scales its draw list by the display density so the engine's units read as dp, matching CSS px on the web and points on iOS. README: the native-geometry section names the lowered hosts. (8d1ff30)
- Engine: coalesce-first optional idioms — `spec.progress ?? 1.0`, `spec.xValues ?? []`, `s.curve ?? identity`, `resolveYDomain` via `?? deriveYDomain(spec)`, annotation guards binding coalesced values before their presence checks. Value-preserving on web (full suite green); these are the shapes Swift can compile, since it does not narrow optionals through ternaries or compound guards. (dd72331)
- Docs: the multiplatform capability matrix gains a Charts (plot engine) row and the web-only table no longer lists `@pyreon/charts` as a whole — the `echarts` facade is web-only, the `/plot` engine and its hosts render natively. The manifest's multiplatform rationale says the same. (8d1ff30)
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
  `.claude/skills/pyreon-benchmarks/SKILL.md` was measured against 0.1.46 and
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

- Updated dependencies:
  - @pyreon/core@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/primitives@0.52.0

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
