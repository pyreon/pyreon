# @pyreon/native-runtime-kotlin

## 0.53.0

### Patch Changes

- [#3838](https://github.com/pyreon/pyreon/pull/3838) [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The `@pyreon/charts` native plugin moves out of `@pyreon/native-compiler` into `@pyreon/charts` itself (`@pyreon/charts/native-plugin`), and the compiler no longer depends on `@pyreon/charts`. Emitted Swift and Kotlin are byte-identical for every golden entry (394, none updated).

  `@pyreon/native-compiler` gains what a package-owned plugin of that size needs: a published plugin-author entry `@pyreon/native-compiler/plugin-api` (the IR types, the `EmitContext` / `ParseContext` facades, `forEachExpr`, `substituteIdentifier` and the pure spelling helpers — a plugin imports nothing else from the compiler); `CompilerPlugin.scopes` (compile-time colour-scope providers: the core keeps the `<PyreonUI mode>` / `<ColorModeProvider mode>` plumbing, the plugin supplies the scope value and may declare a scope-only element such as `<ChartThemeProvider>`); and `CompilerPlugin.stubs` + `ValidateOptions.augment` on `validateSwiftWithStubs` / `validateSwiftFilesWithStubs` / `validateKotlin` / `validateKotlinFiles` (the chart engine's type-gate stubs now come from the plugin). `pyreon-native plugins` lists the colour-scope providers.

  `@pyreon/charts` ships the plugin (manifest `pyreon.native.plugin`, optional peer on `@pyreon/native-compiler`), so `pyreon-native build|check` loads it when a source file imports the package. Behaviour change: a bare `transform()` / `createCompiler()` call with no discovery no longer lowers `@pyreon/charts` hosts, and `--no-plugins` turns them off — load `@pyreon/charts/native-plugin` yourself in that case. The engine generator moved with the registry it writes (`bun packages/fundamentals/charts/scripts/gen-native-engine.ts`); the generated runtime engine files only change their header comment.

  `@pyreon/native-cli`: plugin discovery now defaults the app to the package containing `--source` (not the working directory), so a monorepo example built from the repo root finds the libraries ITS package declares; and the source entry (`bun …/cli.ts build`, what the repo's example build scripts run) now goes through `mainWithPlugins` like the shipped bin, instead of the plugin-less `main` — which would have compiled every plugin-owned library as if it had no native lowering.

## 0.52.0

### Minor Changes

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's value and category axes draw split areas (`ChartSpec.ySplitArea`: bands between the ticks, the colours cycled from the axis start, one per category on a category axis), and a value axis draws minor ticks and minor split lines, each interval cut into a set number of pieces. Series labels take a rotation (about the anchor, with the offset turned with it, as zrender does), an offset, `align` and `verticalAlign`. All of it crosses to iOS and Android through the generated engine.

  The native chart spec printer wrote every array field as numbers, which turned a colour list into `[NaN, NaN]`. It now keeps strings.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts: a horizontal bar chart (a category y axis over a value x axis) now lays out as ECharts does — it previously drew nothing, on web and native — including split areas and minor lines on the value axis. A scrolling legend clips the entry the window cuts instead of dropping it, pages vertically, and honours `pageButtonPosition: 'start'`; the draw list gains `clip` / `unclip` commands, executed by the canvas, SVG, SwiftUI and Compose painters. Rich and multi-line labels now rotate as one block, with ECharts' line height.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts look right out of the box:

  - **Legend and colour by label** (web and native). Marks sharing a label share one legend entry, which toggles all of them, and one palette colour, as ECharts treats a series name. An area under a line, both labelled Revenue, no longer shows two Revenue swatches in two colours.
  - **Area marks** fill translucent (0.3) by default instead of opaque; the new `areaOpacity` mark option sets it.
  - **Charts follow the page's declared scheme.** They read the CSS `color-scheme` on `<html>` when it names one, else the OS preference, so a site with its own theme toggle gets matching charts.
  - **Dark gauges.** Under a non-default theme a gauge takes the theme's text and label colours instead of ECharts' light-theme greys.
  - **Candlesticks.** A candlestick's x labels thin and slant to what fits instead of overlapping, and its zoom's opening window is applied.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bar labels sit and colour themselves as ECharts does. They sit inside the bar by default, and take a position (`top`, `bottom`, `left`, `right`, `inside*` and the inside corners) and a distance. An unstyled label takes zrender's automatic fill: light text haloed in the bar's colour inside it, dark text haloed in the background outside. The halo colour and width can be set. Text draw commands gain an optional halo (`stroke` and `strokeWidth`), painted by the web canvas, the SVG export and both native canvases.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine's default tooltip rows show what ECharts shows: a header and, per value, a round colour swatch, the name, and the value in bold at the right, comma-grouped (`2,500`) unless a `valueFormatter` shapes it. The box is edged in the series colour for an item tooltip. A pie's family tooltip no longer appends a `(100%)` share.

  The rows are built by the new engine `renderTooltipRows` / `pieTipRowsWith`, so iOS and Android draw the same rows.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Linear gradients — `gradient` on a bar-family or `area` mark (ECharts' `LinearGradient` item and area style), the second command of DrawCmd v2. You give the stops and a direction; the engine resolves the two points against the PLOT box, so one ramp spans the chart instead of repeating inside every bar, and the same mark reads correctly at any size. The web canvas builds a `CanvasGradient`, the SSR SVG emits a `<linearGradient>` in `<defs>` with `gradientUnits="userSpaceOnUse"` and references it by id, SwiftUI fills with a `.linearGradient` shading and Compose with a `Brush.linearGradient` — all from the same `ChartGradient` in the draw list. Every gradient-bearing command still carries its solid `fill`, so a backend that cannot paint one, or a caller serializing commands without a `<defs>` to put them in, falls back to the colour rather than to nothing.

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

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native charts now expose their data to screen readers, not just a one-sentence description.

  - **iOS:** the plot host carries an `AXChartDescriptor` (`.accessibilityChartDescriptor(PyreonChartDescriptor(input))`), so VoiceOver offers the Audio Graph and its per-point data explorer.
  - **Android:** `PyreonChartPoints` places one TalkBack node per visible category over its column, labelled with the web table's row ("art, Score 91"). The nodes take no pointer input, so taps still reach the canvas. A zoomed chart labels its visible rows from the full data. Decimated and continuous-x charts keep the description alone.

  Both are built from the same `A11yInput` as the description and the web's hidden table.

- [#3376](https://github.com/pyreon/pyreon/pull/3376) [`9f271ae`](https://github.com/pyreon/pyreon/commit/9f271aeb2c28c58a04d443c945d30c8114a355ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every native chart canvas is now NAMED, and the plot host is DESCRIBED from its own data.

  A canvas is one opaque node to a screen reader. The web hosts have always answered that with the engine's `describeChart` sentence as the `aria-label` plus an offscreen table; natively only a `title` was ever applied — so an untitled chart was a blank rectangle to VoiceOver and TalkBack, and a titled one said its title and nothing about its data.

  - `a11y.ts` crosses with the engine (`ENGINE_FILES`), so `describeChart` / `chartTable` are generated into `PyreonChartEngine.swift` / `.kt` and both targets read the SAME sentence the web does. Its two subscript reads are bounds-checked for the native subset (a Swift subscript is never optional), which also fixes a real web edge: a series longer than the categories, or shorter than its siblings, now renders an empty cell instead of reading past the end.
  - Both emitters apply the label in the web host's order of precedence: an explicit `accessibilityLabel`, else the data description (the plot host, built from the series and categories the canvas painted and through the chart's own `format`), else `title`, else the family word (`chartDefaultLabel`: `PieChart` → "Pie chart", `PlotChart` → "Chart"). The description is emitted INSIDE the scope holding the hoisted series, which is the only place those bindings exist.
  - Device-asserted on both platforms: the tasks showcase's bar chart is queried for its label / content description and must carry the title, the series and the category count.

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Native chrome parity for the family hosts.** `showTitle` / `subtitle`, `showLegend` and `tooltip` now lower on every generic and accessor host (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, funnel, pie) on both native targets — not only on the plot host. The legend's entries and the tooltip's lines come from ONE crossing module, `chrome.ts` (`treemapLegend`, `sankeyTip`, `pieTip`, … plus `renderTooltip`, which draws the box into the draw list), and the web canvas host now calls the same functions, so what a legend lists and what a tap says agree by construction. On native a tap shows the tooltip and a tap on nothing dismisses it; a host with a tap lays out ONCE (the paint and the hit used to compute the layout twice). `animate` is the one chrome prop still named as unlowered.

  PMTC: an annotated local (`const e: LegendEntry = { … }`) steers its object literal to the named struct — the field set alone picked a same-shaped sibling (`Slice` for a `TooltipRow`) or, with an optional field omitted, no struct at all (a tuple); `readonly T[]` / `ReadonlyArray<T>` lower like `T[]`; `keyof` / `unique` warn by name.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Calendar geometry joins the generated native chart engine. `layoutCalendar` / `renderCalendar` / `calendarDomain` / `hitCalendarIndex` are rewritten Date-free (proleptic-Gregorian civil arithmetic in exact Doubles: `daysFromCivil`, `civilFromDays`, `weekdayOfDays`, `parseIsoDays`, `formatIsoDays` — all new exports) and bundled into `PyreonChartEngine.swift` / `.kt`. BREAKING for direct engine callers: `calendarDomain` and `renderCalendar` take a `CalendarValue[]` (`{ date, value }`) instead of a record — wrap a record with the new `calendarValues(record)`; `calendarDomain` returns a `Domain` (`{ min, max }`) and `CalendarOptions.domain` is a `Domain`, not a tuple; `CalendarLayout` gains `startDay` / `days`. `parseIsoDate` / `formatIsoDate` (epoch ms) and the nullable `hitCalendar` move to `engine/calendar-web.ts`, `calendarToSvg` to `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<CalendarChart values={record}>` are unchanged.

- [#3216](https://github.com/pyreon/pyreon/pull/3216) [`e669817`](https://github.com/pyreon/pyreon/commit/e6698175ffe21651057be52086b2706177e854d0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The candlestick and heatmap geometry join the generated native chart engine (`PyreonChartEngine.swift` / `.kt`): `ohlcExtent`, `renderCandles`, `buildHeatGrid`, `colorRamp`, `HEAT_RAMP` and `renderHeat` now lower with zero transform warnings and compile on both toolchains. Two engine-side idioms made it possible with no behavior change on web: `renderCandles` takes an OPTIONAL options object (an empty-object-literal default has no native lowering) and `buildHeatGrid` keys its aggregation map by an INDEX into the cells array (a Map with a struct value has no native lowering).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The funnel family's geometry (`layoutFunnel` / `renderFunnel` / `hitFunnel`) joins the generated native chart engine — one TypeScript source, compiled by PMTC into `PyreonChartEngine.swift` / `.kt`, so a funnel lays out identically on iOS and Android. `funnelToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Gantt geometry joins the generated native chart engine, built on the calendar family's Date-free civil arithmetic. BREAKING (pre-1.0, clean API): time is DAYS since 1970-01-01 everywhere — `GanttTask.start` / `end` and `GanttOptions.today` are ISO `YYYY-MM-DD` strings only (epoch-ms values and the `Date.parse` fallback are gone; convert with `formatIsoDate`), `GanttOptions.domain` is a `GanttRange` (`{ start, end }`, ISO) instead of a tuple, `GanttLayout.domain` is a `Domain` (`{ min, max }` in days), `GanttRow.startMs` / `endMs` become `startDay` / `endDay`, `GanttRow.label` is the name string with `labelAt` beside it, and `GanttLayout.today` becomes `hasToday` + `todayX`. `ganttTicks` takes and returns days (`GanttTick[]`, `x` filled by the layout). The engine answers hits as an index (`hitGanttIndex`); the nullable `hitGantt` lives in `engine/gantt-web.ts` and `ganttToSvg` in `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<GanttChart>` are unchanged.

- [#3173](https://github.com/pyreon/pyreon/pull/3173) [`6c32d06`](https://github.com/pyreon/pyreon/commit/6c32d06f66afbb7fd50613e757c0b7c8dcaff957) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart engine crosses to native as GENERATED runtime source: `gen-chart-engine.ts` compiles the ten `@pyreon/charts` engine modules through the real PMTC transform (zero warnings is a hard precondition — a warning is a silently-gutted function) into committed `PyreonChartEngine.swift` / `PyreonChartEngine.kt`, with the draw-list types renamed to the canvas-owned `PyreonChartPt`/`PyreonChartRect`/`PyreonDrawCmd`. The Swift emit is publicized (explicit public memberwise inits — SPM module boundary), and `PyreonDrawCmd` gains a full defaulted-parameter init in the synthesized field order so the emitted named-subset constructions compile. Drift-locked: `native-chart-engine-generated.test.ts` regenerates, asserts byte-equality, and compiles both targets against the verbatim canvas types.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Graph geometry joins the generated native chart engine. `layoutGraph` / `renderGraph` are rewritten in the PMTC subset and bundled into `PyreonChartEngine.swift` / `.kt`. The force layout's PRNG is now a Park–Miller LCG in exact Double arithmetic (`graphNextSeed`, exported) instead of mulberry32 — still deterministic per `seed`, but a given seed produces a DIFFERENT arrangement than before. The engine answers hits as an INDEX (`hitGraphIndex`, -1 for none); the web-facing nullable `hitGraph` lives in `graph-hit.ts` and `graphToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderGraph` no longer takes a measurer. `GraphLayoutLink` gains `index` (position among the kept links) and `GraphLayout` gains `mode` (the layout that ran) — additive, and what keeps the crossed structs distinct from sankey's.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Heatmap and candlestick geometry join the generated native chart engine. `buildHeatGrid` / `renderHeat` / `hitHeatCell` and `ohlcExtent` / `renderCandles` / `hitCandle` are bundled into `PyreonChartEngine.swift` / `.kt`. The colour ramp is now a plain function, `rampColor(stops, t)` (new export); `HeatmapOptions.ramp` (a closure) is REPLACED by `stops?: string[]` (default `HEAT_RAMP`), and the closure factory `colorRamp(stops)` moves to `engine/heat-ramp.ts` (still exported from `@pyreon/charts/plot`, built on `rampColor`). `renderCandles`' options parameter is optional instead of defaulting to `{}`; `hitCandle` is now exported from `/plot`.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Parallel coordinates join the generated native chart engine — the last chart family to cross. BREAKING (pre-1.0, clean API): the engine takes NUMERIC rows (`Double[][]`; a category as its index in the axis's `categories`, a gap as `NaN`) — the web `ParallelRow` (`(number | string | null)[]`) is converted with the new `parallelRows(axes, rows)` (`<ParallelChart>` and `parallelToSvg` do this for you); `ParallelAxis.domain` and `ParallelLayoutAxis.domain` are `Domain` structs; the per-axis `place` closure is the function `parallelPlace(axis, value)` → `{ ok, y }`; `ParallelLine.points` is `Pt[]` with a parallel `present: boolean[]` (a gap is an absent point, not `null`) and `lineRuns(points, present)` matches; `ParallelOptions.lineColor` is a string only, with the per-row callback expressed as `lineColors: string[]` (`parallelLineColors(rows, fn)`, or `<ParallelChart rowColor={fn}>`). `hitParallelIndex` is the engine's hit; the nullable `hitParallel`, `parallelRows`, `parallelLineColors` and `lineRuns` live in `engine/parallel-web.ts`; `parallelToSvg` in `family-svg.ts`. The `@pyreon/charts/plot` re-exports are unchanged.

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Polar geometry (`layoutPolar` / `renderPolar` / `hitPolarIndex` / `polarTicks`) joins the generated native chart engine. The engine's hit answers indices (`PolarHitIndex`); the web-facing `hitPolar` + `PolarHit` union live in `polar-hit.ts`; `PolarLayout.lines` / `categoryLabels` / `ticks` are the named `PolarLine` / `PolarCategoryLabel` / `PolarTick`; `renderPolar` drops its unused measurer; `polarToSvg` moved to `family-svg.ts` (all still exported from `@pyreon/charts/plot`).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Sankey geometry joins the generated native chart engine. `layoutSankey` / `renderSankey` / `ribbonPoints` are rewritten in the PMTC subset (name lookups are scans, the relaxation stack/resolve steps are inlined, comparator sorts are insertion sorts, no `Infinity`) and bundled into `PyreonChartEngine.swift` / `.kt`. The engine answers hits as INDICES (`hitSankeyIndex` → `{ node, link }`); the web-facing `hitSankey` union lives in `sankey-hit.ts` and `sankeyToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderSankey` no longer takes a measurer (labels do not need one).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Tree and theme-river geometry (`layoutTree` / `renderTree` / `hitTree` / `linkPoints`, `layoutRiver` / `renderRiver` / `hitRiver` / `smoothPoints` / `layerPolygon`) join the generated native chart engine. `TreeLink` carries the entered node's `depth`; `RiverLayout.ticks` is a named `RiverTick`; `renderTree` drops its unused measurer parameter; `treeToSvg` / `riverToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3290](https://github.com/pyreon/pyreon/pull/3290) [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Treemap and sunburst geometry (`layoutTreemap` / `renderTreemap` / `hitTreemap`, `layoutSunburst` / `renderSunburst` / `hitSunburst`, `nodeValue`, `treeDepth`, `tintHex`) join the generated native chart engine — squarify and the radial partition run from one TypeScript source on iOS and Android. `treemapToSvg` / `sunburstToSvg` moved to `family-svg.ts` (still exported from `@pyreon/charts/plot`).

- [#3345](https://github.com/pyreon/pyreon/pull/3345) [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The entrance animation crosses. On the web, `animate` was wired on `<PlotChart>` only: the fourteen canvas-host families (treemap, sunburst, tree, river, sankey, graph, gantt, polar, calendar, parallel, funnel, map, boxplot, heatmap) took the prop and never passed the tween's progress to their engine, so they painted fully formed. Each now declares `animates` and hands `progress` to its render (`renderHeatChart` takes it as an optional trailing argument). Natively, both emitters render every host whose engine takes a `progress` — the same set — inside a new `PyreonChartEntrance` runtime view (SwiftUI `TimelineView`, paused once the tween ends; a Compose `Animatable`), which hands the cubic ease-out progress into `ChartSpec.progress`, into a copy of the host's `XOptions`, or as the heatmap wrapper's argument, over `theme.enterMs`; Reduce Motion on iOS and a zero animator scale on Android render at once, like `prefers-reduced-motion`. `animate={false}` emits the host exactly as before. An engine with no entrance (Pie, Radar, Candlestick, Gauge) now names `animate` as inert on every target instead of "not lowered on native".

  Two fixes the copy exposed: an inline options literal (`tree={{ symbolSize: 8 }}`) lowered to a synthesized `__Obj0` that swiftc rejected against `TreeOptions` — it is steered to the engine struct now — and a non-nil options value was read with optional chaining in the tooltip and hit paths, an error on a non-optional in Swift.

- [#3167](https://github.com/pyreon/pyreon/pull/3167) [`73719ca`](https://github.com/pyreon/pyreon/commit/73719ca3190345da6d54c86e55233be599e9baa3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Chart Canvas executors: `PyreonChartCanvas` (SwiftUI `Canvas` / Compose `Canvas`) walks the chart engine's flat `PyreonDrawCmd` draw list — the native twins of the web canvas renderer, with identical dispatch (rect/line/polyline/polygon/circle/text), the same text-anchor semantics, and a shared color-string parser (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`; an unknown color paints transparent rather than throwing). The RUNTIME owns the `PyreonChartPt`/`PyreonChartRect`/`PyreonDrawCmd` contract — the generated chart-engine geometry (gen-native-chart-engine, follow-up) references these types rather than re-declaring them, so concatenation can never collide.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The candlestick and heatmap frames move into the engine — `candlestickFrame` / `renderCandlestickChart` / `hitCandlestickChart` and `heatGridFrom` / `heatPlotFor` / `renderHeatChart` / `hitHeatChart` (exported from `@pyreon/charts/plot`) — so the web hosts and the native canvas paint the SAME command list; both modules cross into the generated native engine. The native runtimes gain `pyreonChartMeasure` (UIKit / `Paint` text width in engine units), the measurer a laid-out frame needs. `<CandlestickChart>`, `<HeatmapChart>` and `<RadarChart>` lower to native (accessor bodies inlined; a `theme` override, a cell-shaped heatmap `onSelect` and `showLegend` warn by name).

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` family hosts lower to native. `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>` and `<PolarChart>` — the hosts whose props are plain data — now emit `PyreonChartCanvas` over the generated engine (`renderX(layoutX(...))` with the web host's own box arithmetic), sized by a `GeometryReader` / `BoxWithConstraints` or by `width` / `height`, with `title` as the accessibility label and `data-testid` as the identifier. The accessor-prop hosts (`PlotChart`, `PieChart`, `GaugeChart`, `RadarChart`, `FunnelChart`, `HeatmapChart`, `CandlestickChart`), `CalendarChart` (a record) and `ParallelChart` (mixed rows) warn BY NAME on native instead of naming a view that does not exist. Importing from `@pyreon/charts/plot` no longer raises the package's web-only warning. The Swift/Kotlin stub typecheck links the REAL generated engine when a chart host is present. `PyreonChartCanvas.kt` scales its draw list by the display density so the engine's units read as dp, matching CSS px on the web and points on iOS. README: the native-geometry section names the lowered hosts.

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

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine gains ECharts' default tooltip rows for cartesian charts and funnels: `tooltipAxisCells`, `tooltipItemCells` and `funnelTipRowsWith`. An item tooltip shows the series under the pointer or tap, an axis tooltip a row per series, and a series with no name shows no generated "Series 1". They are generated into the native engines, so iOS and Android show the same rows. A formatted tooltip keeps the plain lines on native, since native runs no formatter function.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add backend-neutral repeating pattern fills for bar and area marks, rendered consistently by canvas, SVG, SwiftUI, and Compose.

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

- [#3315](https://github.com/pyreon/pyreon/pull/3315) [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`@pyreon/charts/plot` gets one theme.** `ChartTheme` is now a token map — `palette`, `background`, `surface`, `text`, `label`, `axis`, `grid`, `fontFamily`, `fontSize`, `titleSize`, `radius`, `enterMs`, `updateMs` — and every host, family, legend, title and tooltip reads from it. Series colours come from `theme.palette` (the nine private copies of one hex list are gone), so "change the series colours" is finally a theme. `chartThemes.light` / `chartThemes.dark` ship built in, `palettes` exports the named sets (`pyreon`, `pyreonDark`, `echarts6`, `echarts5`, `echartsDark`, `observable10`, `tableau10`, `okabeIto`, `tailwind`), and the new default palette is Pyreon's own. `<ChartThemeProvider theme>` provides a theme to every chart below it, in the colour mode in scope (`<PyreonUI mode>`, `<ColorModeProvider>`, else the page's scheme and the OS). Breaking: `ChartTheme` gained required fields — a hand-built full `ChartTheme` needs them (a `Partial` on the `theme` prop is unchanged).

  Also on `/plot`: `<BoxplotChart>` + `fiveNumber` and the `sma` / `ema` / `bollinger` / `trend` indicator marks were built and tested but never exported — they are now.

  Native: the theme struct crosses with every field, `theme={{ palette: [...] }}` colours a plot's marks on iOS/Android, and `palette.ts` joins the generated engine.

  PMTC lowers `readonly T[]` / `ReadonlyArray<T>` exactly like `T[]` (the theme palettes are `readonly string[]` end to end, so an `as const` palette typechecks as a theme override); `keyof` / `unique` types warn by name.

- [#2766](https://github.com/pyreon/pyreon/pull/2766) [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useCrashReporter()` — cross-platform crash capture, persistence, and rehydration. Captures uncaught errors (web `window.onerror`/`unhandledrejection`, iOS `NSSetUncaughtExceptionHandler`, Android `Thread.setDefaultUncaughtExceptionHandler` chaining to the previous handler), persists the report (localStorage / Application Support / app files dir), and rehydrates the previous session's report on the next launch — the credential-free half of crash reporting. The vendor transport (Sentry, a custom endpoint) is app-wired via `setCrashTransport` / `PyreonCrashTransportRegistry`, so the framework never fakes an upload. `useCrashReporter()` lowers to both native targets (SwiftUI + Compose); the Android factory self-installs a file-backed backend so the report survives the crash it reports. Signal crashes (iOS) and NDK crashes (Android) are disclosed out of v1 scope.

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

- [#2795](https://github.com/pyreon/pyreon/pull/2795) [`84e7444`](https://github.com/pyreon/pyreon/commit/84e7444cbde8b3f0259a1bdc91674d893d19d26c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate the @pyreon/hooks native runtimes (Batch 3).

  Moves 21 hook service runtimes (AppState, Auth, Biometrics, Clipboard,
  CrashReporter, Database, Fetch, FilePicker, Geolocation, Haptics, ImagePicker,
  Linking, MapState, NetworkStatus, Notifications, Payments, PushNotifications,
  Share, VideoPlayer, WebSocket, WebView + their Android/OkHttp variants — 28
  Kotlin, 21 Swift files) out of the monolith into @pyreon/hooks/native, using the
  per-service-group gate from the storage batch: 20 kotlinServices groups (each
  under its own --service stub bundle; the 6 hooks with base dependencies —
  Auth→PyreonHttp, CrashReporter→StorageBackends+Json, Database/Fetch/WebView→Json,
  Geolocation→StorageBackends — reference the retained monolith primitives via
  @base/ companions). WebView's Kotlin is device-only (android.webkit was never
  stub-covered in the monolith).

  The monolith now holds ONLY the framework-base runtimes (Reactivity, Tokens,
  ViewModifier, Json, Assets, Http/OkHttp, StorageBackends). All 10 native example
  apps gain the @pyreon/hooks/native source root.

  Follow-up: the monolith's Swift hook-logic tests are removed here (the Kotlin
  tests moved with their runtimes and run in the co-source gate; the Swift side is
  typecheck + device-verified) — relocating them as co-located @main programs is a
  tracked follow-up.

- [#2790](https://github.com/pyreon/pyreon/pull/2790) [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate native runtimes into their own packages.

  The Swift/Kotlin runtimes for form, store, state-tree, machine, i18n, permissions,
  and query move out of the `@pyreon/native-runtime-*` monolith into each package's
  `native/{swift,kotlin}/` (declared via the `pyreon.native` package.json field,
  aggregated by `pyreon-native wire`). Framework-base runtimes (reactivity/styling/JSON
  helpers) stay in the monolith. A new `scripts/check-native-cosource.ts` gate compiles
  and smoke-runs every co-located `.swift`/`.kt` against the stub harness so a relocated
  runtime can't rot silently. No API change — this is a source-location move.

- [#2793](https://github.com/pyreon/pyreon/pull/2793) [`dfdb7f4`](https://github.com/pyreon/pyreon/commit/dfdb7f4952d6f61dfe22fadab1e7bc31175d619f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate the @pyreon/storage native runtime.

  Moves the storage-specific Swift/Kotlin runtimes (PyreonStorage,
  PyreonSecureStorage + the Android impls) out of the monolith into
  `@pyreon/storage/native/{swift,kotlin}`. `PyreonStorageBackends.kt` — the
  shared persistence primitive (backend interface / registry / file backend /
  codec, also used by PyreonCrashReporter) — deliberately STAYS in the base
  monolith runtime; the co-located storage group references it via a new
  `@base/<File>.kt` companion in the co-source gate.

  Gate work (reusable for future batches): `verify-kotlin --files=<set>`
  (per-service-group compile) + a companion-suppression filter that drops the
  monolith companion append while keeping explicitly-listed `@base/` files;
  `check-native-cosource` grows a `pyreon.native.kotlinServices` map (each group
  compiles under one `--service` stub bundle) and a `@base/` prefix for
  framework-base companions. The `PyreonSecureStorageAndroid` stub service now
  also writes the compose-ui LocalContext stub so the whole storage graph
  verifies as one group.

  The six example apps whose shared source uses `useStorage`/`useSecureStorage`
  (finance, router-demo, todomvc × android+ios) gain the co-located storage
  source roots. No public API change — a native-source relocation.

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC lowers a TS integer `number` to Kotlin `Long` (64-bit) instead of `Int` (32-bit), matching Swift's `Int`. One shared source now holds the same values on both targets: `{ createdAt: 1726000000000 }` decoded on iOS and threw `Failed to parse int` on Android, and integer arithmetic past 2147483647 overflowed on Android only. Integer literals emit with the `L` suffix, and the emitter converts at every Kotlin/Compose API that takes `Int` (subscripts, `take`/`drop`/`substring`/`padStart`, `List(n)`, Compose dimensions, shift counts) and widens at every one that returns `Int` (`.size`, `.length`, `indexOf`). `parseInt` lowers to `toLongOrNull`, and a `useUrlState` integer accepts the JS safe-integer range on both targets (it was pinned to 32 bits on iOS too).

  Breaking for hand-written Kotlin against these runtime surfaces: `PyreonFieldArray` (`length`, `key`, and every index parameter) and `PyreonTableState` (`page`, `pageCount()`, `filteredCount()`, `setPage`, the `pageSize` and `rowId` index parameters) now use `Long`; the generated chart engine and `PyreonChartHandle` state (`hover`, `selected`, `hidden`, `step`, `seriesCount`) use `Long` indices and counts.

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).

- [#3526](https://github.com/pyreon/pyreon/pull/3526) [`dfc7231`](https://github.com/pyreon/pyreon/commit/dfc7231c48b58fb2fcd90f066d847f2c0d4faf36) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart canvas paints radial gradients: `PyreonChartGradient` carries a `radial` flag (the centre plus a point on the outer circle), and the mirror / transpose passes carry it through. The generated chart engine is regenerated from the shared TypeScript source.

  The generated chart engine also carries the series state fields (`focus`, `emphasisColor`, `selectColor`, `blurOpacity`) and paints them through one `stateFill`.

- [#3740](https://github.com/pyreon/pyreon/pull/3740) [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native streams behave like the web in three more places.

  - `@pyreon/http` native runtime (Kotlin): the stream loop reads on its own thread but no longer writes from it. Every state write (`events`, `latest`, `status`, `error`) and every `onEvent` call is handed to a main executor — the emit passes `PyreonStreamMain`, the Android main looper (new `PyreonStreamAndroid.kt`) — so `onEvent` code touching main-bound state behaves as it does on the web, where the whole hook runs on one thread. Each queued write re-checks that its stream is still the live one, so a write queued before `stop()` / `idle()` / `abort()` can no longer land after it. On Swift the loop already ran on the main actor; the loop parity test now asserts it.
  - `@pyreon/native-runtime-swift` / `@pyreon/native-runtime-kotlin`: `PyreonJSON.stringify` / `PyreonJson.stringify` write exactly the bytes the web's `JSON.stringify` writes for the same value — keys in source order (Swift's `JSONEncoder` did not keep it), numbers laid out by ECMAScript's `Number::toString` (`1`, not `1.0`; `1e+21`; `-0` → `0`; `NaN` → `null`), and strings escaped as `JSON.stringify` escapes them (no `\/`).
  - `@pyreon/native-compiler`: `JSON.stringify(x)` lowers to those, so a stream's runtime `json` body (and every other stringified value) is byte-identical across web, iOS and Android. The Kotlin `useStream` emit passes `main = PyreonStreamMain`.
  - `@pyreon/lathe`: a stream-only non-GET operation with a JSON body (or none) now reaches native as a TRIGGERED `<Op>Stream` component — `enabled: boolean` opens the stream while true, the body is the `json` prop — the `useStream(src, { enabled })` + runtime `json` shape the native compiler lowers. A form / multipart / text / binary body, or a path parameter named `enabled` / `json` / `children`, stays web and the reach report says which.
  - `@pyreon/query`: the `useStream` manifest entry records the main-thread `onEvent` and the byte-identical body.

- [#3104](https://github.com/pyreon/pyreon/pull/3104) [`6ff12da`](https://github.com/pyreon/pyreon/commit/6ff12daac8f97c36ddc5c083810718a551a588f5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC: an `@pyreon/http` endpoint whose `:param` is a RUNTIME value now lowers to iOS and Android through `useQuery`.

  `useQuery<User>(() => getUser.query({ params: { id: props.userId } }))` previously warned and stayed web, because the URL was resolved as a compile-time constant and a signal read has no compile-time value. That made the most ordinary thing an API-backed screen does — fetch the record named by a prop — the one thing that did not cross. It now emits native string interpolation, and the runtime value is carried in the CACHE KEY as well as the URL, so the harness re-fetches when the value changes exactly as the web does.

  The value is percent-encoded at runtime by a new `PyreonURL.encodePathParam` in both runtimes, which mirrors the web's `encodeURIComponent(String(value))` — verified by executing both shipped encoders against the real `encodeURIComponent` over a 60-case corpus (delimiters, whitespace, multi-byte UTF-8, numbers).

  `useFetch` deliberately still bails: it lowers to a one-shot task with nothing to re-run it, so a runtime URL there would fetch once and freeze at that first value while the web kept re-fetching. Its warning now names `useQuery` as the fix rather than describing the limitation.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3774](https://github.com/pyreon/pyreon/pull/3774) [`cdb8a24`](https://github.com/pyreon/pyreon/commit/cdb8a24d46e2c9b8e1ee0813df8ff6410647fb69) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Keep band regions paired across missing bounds on canvas, SVG and native. Resolve both band boundaries once per frame to avoid repeated full-channel scans, and preserve infinite-value gaps during keyed updates of transformed marks.

- [#3473](https://github.com/pyreon/pyreon/pull/3473) [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower `PlotChart` locale formatting to native number and UTC date formatters on Swift and Kotlin.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Accessibility on `<Chart>` / `<PlotChart>`:

  - **Up/Down now step through the series.** Left/Right still walk the data. With a series picked, the live region reads just that series — `Revenue: 3,200 at Mar, 3 of 12` — so a keyboard user can follow one line across the chart instead of hearing every series at every point. Stepping past the last series returns to the whole row; Escape clears both. Up/Down used to duplicate Left/Right.
  - **The spoken summary says how much a series moved,** not only which way: `rising 45% from 100 to 145`, `rising 3.2× from 100 to 320`. No percentage is stated from a zero or negative start. The native `describeChart` says the same.
  - **Fix:** the web canvas's description, table and announcements named series "Series 1", "Series 2" even when each mark had a `label`, so a screen reader heard names no sighted reader saw. They now use the mark's label, as the legend, the tooltip and the native hosts already did.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The area brush (ECharts' `brush` model) works on web and native.

  - `PlotChart` takes `brushType` (rect, polygon, lineX, lineY), `brushMode`, `outOfBrushOpacity`, `brushSeriesIndex` and `onBrushSelected`. Datums outside the brush fade, and the callback reports the brushed data indices per series.
  - `toolbox.brush` adds the rect / polygon / lineX / lineY / keep / clear tools.
  - iOS and Android lower all of it onto the chart host. The selection geometry is one shared engine module.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis `offset` maps on web and native: the x axis and both y axes move off the plot edge by their offset, with their labels, and the gutter grows by the same amount so nothing clips. Native spec literals now accept numbers.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis `position` maps on web and native: `xAxis.position: 'top'` draws the x axis above the plot, a lone `yAxis.position: 'right'` draws the value axis on the right, and two y axes whose first is placed right swap sides with `yAxisIndex` following. Two y axes placed on the same side warn by name.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `date(pattern)` formats epoch milliseconds for a time axis, a tooltip or a table: `<Axis x time format={date('MMM YYYY')} />`. It formats in UTC, so labels never shift with the reader's timezone, and prints the same on the web, iOS and Android. Tokens: `YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm` `ss`; `[text]` is printed as written. `formatDate(ms, pattern)` is the one-shot form.

  Numbers now print the same on iOS and Android as on the web:

  - A template literal or a `<Text>` child holding a whole-valued `Double` printed `7.0` on both native targets where the web prints `7`. The generated chart engine goes through the same path: on iOS, axis ticks read `20.0` and percentage labels `42.0%`; on both targets, calendar year labels read `2024.0`. Such values now go through a JavaScript-faithful `pyreonNumberString`.
  - A numeric `x` field used as categories (`<Chart x="year">`) did not compile on iOS. Such values are now converted to strings.
  - An integer literal outside the 32-bit range, such as an epoch-millisecond timestamp in fixture data, typed its field `Int` and failed to compile on Android. It is now a `Double`, like every other JavaScript number that cannot fit.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Decals follow ECharts' model on web and native. A decal tiles its `symbol` (rect, circle, triangle, diamond, pin or arrow) on the `dashArrayX`/`dashArrayY` pitch, scaled by `symbolSize` and turned by `rotation`. Previously every decal collapsed to diagonal, cross or dots. `aria.decal.show` gives each series without a decal a distinct default texture. Pattern geometry now lives in one engine function (`patternMarks`) that the web canvas, SVG, SwiftUI and Compose painters all draw, so a texture cannot differ by target. `ChartPattern` gains `angle`, `symbol` and `spacingY`, and a `symbols` kind.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart handle's `dispatch` (ECharts' `dispatchAction`) is now one pure reducer, `applyChartAction`, and it runs on web, iOS and Android.

  - New actions: `takeGlobalCursor` (arm the area brush) and `brush` (set or clear its areas).
  - A dispatched `brush` fires `onBrushSelected`, as a drag does.
  - On native, `createChartHandle()` lowers to a `PyreonChartHandle`. A bound `PlotChart` reads and writes its fields, and `handle.dispatch({ ... })` with an inline action object lowers too.
  - Fixed: a `PlotChart` with `selectedMode` under a zoom window no longer fails to compile on native.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine can lay a cartesian chart out on ECharts 6's default grid: the plot sits 15% from the left, 65 px from the top, 10% from the right and 80 px from the bottom, and grows only where an axis label would otherwise leave the chart (`outerBoundsMode: 'auto'`). The title, legend and zoom slider draw in the grid's margins instead of pushing the plot around.

  - **Line symbols:** a line series can show ECharts' `emptyCircle` at its data, and `showAllSymbol` is honoured. A crowded category axis keeps only the symbols at its label interval, as ECharts does. Empty symbols (`emptyCircle`, `emptyRect`, …) draw as a ring round the chart surface.
  - **Axis labels:** category x-axis labels thin by ECharts' own `calculateCategoryInterval` instead of rotating, and take an explicit rotation or interval.

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

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Chart engine hardening:

  - Small values no longer print as `0`: `plain` keeps about three significant digits below 0.01 and switches to exponent notation outside 1e-4…1e15, and tick labels carry the precision their step needs. A chart of 0.00012-scale data used to label every tick and tooltip `0`.
  - Numeric strings (`"42"`, the usual shape of CSV or form data) are coerced with a one-time dev warning instead of silently plotting as gaps, and an unknown mark kind warns.
  - Month, quarter and year time-axis ticks sit on calendar boundaries in UTC; they used to drift from a fixed-length step counted from the epoch.
  - `maxPoints` below 3 and a log axis over values ≤ 0 warn.
  - The canvas backing store is no longer reallocated on every draw when its size is unchanged, and a devicePixelRatio change redraws at the new density.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A third and later y axis (`yAxis[2]`, `yAxis[3]`, …) is now drawn on web and native, on its `position` side at its `offset`, with its own domain, tick labels and title. A series with `yAxisIndex: 2` or higher scales on it. A `yAxisIndex` that names no declared axis warns by name.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<GaugeChart dial>` draws a gauge the way ECharts does, from a spec built by the new `gaugeDial()` builder:
  - the axis line in colour bands (colour stops, `roundCap`);
  - split lines, ticks and labels round the dial (lengths in pixels or percent of the radius, `auto` colours, label formatter / rotation);
  - a pointer and an optional progress arc per value (`overlap`, `clip`, `roundCap`);
  - the anchor, and each value's title and detail, with per-datum offsets;
  - the detail box (background, border, width, height, padding);
  - pointer and anchor icons (rect, circle, diamond, triangle, arrow);
  - start and end angles, direction, `min` / `max` and `splitNumber`.

  Text draw commands gain an optional `weight` ('bold'), drawn by the web canvas, the SVG string and both native canvases.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every series on a `geo` now draws. Previously only the first series rendered and the rest were silently dropped. `scatter`, `effectScatter` and `lines` combine. A `heatmap` on the geo draws soft radial blobs coloured by the visual map, a `pie` with `center: [lon, lat]` draws at that point, and a `map` series with `geoIndex` colours the geo's regions. `<MapChart>` gains `heat`, `heatRadius`, `heatStops` and `pies` on web and native. Anything else on a geo (a series off it, a pie without a centre, an unsupported type, a trail on geo lines) warns by name. `withAlpha` now applies alpha to `rgb(...)` colours; it used to return them fully opaque.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Geo lines animate an `effect` trail on web and native. `<MapChart trail>` (`period`, `trailLength`, `color`, `symbolSize`) runs it along `paths` on the same frame clock as cartesian lines: the web canvas host's clock, or `PyreonChartClock` on native. Under reduced motion the trail holds still.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Image patterns and `path://` / `image://` decal symbols draw on web and native. An ECharts `color: { image, repeat }` fill (a URL, a data URI, an `<img>` or a `<canvas>`) tiles at its natural size with `repeat`, `repeat-x`, `repeat-y` or `no-repeat`; an `image://` decal tiles the image on the decal pitch; a `path://` decal draws its SVG path (`M L H V C Q Z`), fitted to the symbol size. The web canvas, SwiftUI and Compose load each image once and repaint when it arrives. A line stroke image is named, since only fills take patterns.

- [#3592](https://github.com/pyreon/pyreon/pull/3592) [`bd76a4a`](https://github.com/pyreon/pyreon/commit/bd76a4ac437a0b7c6dd5bc4495ef2a7573f3afe5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Moving the keyboard focus through a chart formats the one row it announces. It
  used to build the chart's whole data table, uncapped, on every arrow key, Home
  or End to read that row back out: on a 100,000-point line chart, 100,024
  formatted values per keystroke, now 25. The native chart engines are
  regenerated from the same table code; their behaviour is unchanged.

- [#3757](https://github.com/pyreon/pyreon/pull/3757) [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two gaps in the keyed `<Chart by>` morph are closed. On iOS and Android, value labels no longer jump to their new place while the bars slide: every value label of a keyed chart carries its row key, and the native tween hides keyed labels until it lands — what the web morph already did. And a line with gaps now morphs by key on every target: the engine keys each unbroken run with its own rows (and the series by its label), native matches a point across runs a gap opened or closed, and the web morph breaks the line at a gap instead of bridging it mid-animation. A curved line keeps the positional tween on native, where curves do not lower.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Charts: a 100,000-point line mounts ~9× faster in real Chromium (~320ms → ~36ms), measured head-to-head against ECharts 6 in `examples/benchmark` (`bun run bench:charts`). The layout measured every category label with `measureText`; it now samples them the way ECharts' `calculateCategoryInterval` does (every `floor(n/40)`-th label past 40). The label step is no longer capped at 200, which drew ~500 overlapping labels on a 100,000-category axis. The accessible table formats only the rows it shows (`chartTable` takes a `limit` and reports `total`) and updates its cells in place instead of remounting 1,000 rows per draw. The y extent is streamed instead of copied twice per resolve, and the accessibility input reuses the drawn layout instead of laying the chart out a second time.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ECharts `lines` series are now an engine feature, and their animated `effect` trail works. The head travels each line once per `period`, trailing `trailLength` of it in `effect.color`, driven by a frame clock in the web canvas host and in new `PyreonChartClock` native views. Under reduced motion the clock holds at 0 and the chart is still.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A dense category line (straight segments, no gaps) is now reduced straight from its value array instead of creating one point per datum and then dropping almost all of them. The drawn points are bit-identical to before. At 1M points the engine's line render drops from about 470 ms to about 46 ms, most of which was garbage collection of the dropped points. iOS and Android use the same path.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A line with more points than its plot has pixels is drawn from at most eight points per CSS pixel (M4: the first, lowest, highest and last point of each half-pixel column), which is how uPlot draws large series. A 1,000,000-point line on an 800px plot now strokes about 3,000 points instead of a million. Measured in real Chromium, the reduced line covers exactly the same pixels as the full one; antialiasing shade along a dense zigzag can differ slightly, because the full path overlaps itself hundreds of times per column. Horizontal charts and non-monotone point sets are drawn unchanged. iOS and Android use the same reduction.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Maps roam on web and native. `<MapChart roam>` pans on drag and zooms on the wheel or pinch, about the pointer, within `scaleLimit`. `roam: 'scale'` only zooms and `roam: 'move'` only pans. The view is part of the engine's `GeoOptions` (`zoom`, `panX`, `panY`), so regions, overlays and hit tests follow it. On native the gestures run the same `geoRoamPan` / `geoRoamZoom`.

- [#3362](https://github.com/pyreon/pyreon/pull/3362) [`0295aaa`](https://github.com/pyreon/pyreon/commit/0295aaaac118b3f8716a09b2549179be3110e8a0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts/plot` on iOS/Android — the native side of the host-parity audit.

  - **A bare host follows the runtime colour scheme.** With no `theme` and no `<ChartThemeProvider>`, a chart on the web follows `prefers-color-scheme`; on a phone it was hard-wired to the light theme, silently. Every field the two built-in themes disagree on now lowers to a runtime conditional over SwiftUI's `colorScheme` environment / Compose's `isSystemInDarkTheme()`; sizes and timings stay literals; a named theme or a provider scope pins it as before.
  - **`<BoxplotChart>` crosses**: its `fiveNumber` reduction and the whole frame (`boxplot-chart.ts`) are generated into both engines; the host lowers with an entrance, a tap per band and the theme. `boxplotToSvg` moves to `boxplot-svg.ts` (same export from `/plot`); `boxplotFrame` / `renderBoxplotChart` / `hitBoxplotChart` are exported.
  - **`<RadarChart>` gets a tap on both targets** (`onSelect` / `onSelectIndex` receive the engine's `{ series, axis }` hit) — it had none on either.
  - **What does not cross says so**: a rich-hit `onSelect` on the eleven table-driven hosts warns and names `onSelectIndex` (it vanished); `<ParallelChart tooltip>` warns (the policy claimed it lowered); `<MapChart>` declines by name instead of falling into the generic component emit as a symbol no target has.
  - The Kotlin frame hosts (Heatmap, Candlestick, Boxplot, Radar) key their tap on the vals it captures, so a tap after a data change resolves against the current geometry (`pointerInput(Unit)` kept the first composition's).
  - Device assertions in the tasks showcase on both platforms: a tap on the radar's first vertex reports series 0 / axis 0, a tap per boxplot band reports its index.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Numbers read as ECharts shows them: axis ticks, tooltips, the spoken description and the accessible table now group thousands by default (`60,000`, not `60000`), matching ECharts' `addCommas`. `currency('$')` groups too (`$60,000`). Series value labels are unchanged, since ECharts' `{c}` shows the raw value, and an explicit `format` still wins everywhere.

  A `<Band>`, and the envelope of `<Bollinger>`, now fills translucently by default (opacity 0.3, as `<Area>` does) instead of opaquely in the palette colour, which hid the lines drawn over it. `areaOpacity` sets it.

  The generated Swift and Kotlin chart engines are regenerated, so iOS and Android show the same numbers.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `PlotChart`'s zoom gains `initialZoom` (the opening window) and `zoomLimits` (`zoomLock`, `minSpan`, `maxSpan`) on web and native, with the limits applied to every gesture by a new engine function.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The engine lays a pie out the way ECharts does. `layoutArcsWith` and `ArcConfig` take the start and end angles, direction, minimum and pad angles, rose type and the zero-sum rule. The new `pie-labels` module places the slice names outside the pie on two-part guide lines, pushed apart so they never overlap and cut with an ellipsis when they would leave the chart. The native engine carries the same maths. A hit on a pie now reports the slice's input index when a slice before it draws nothing.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Presentation states — ECharts `emphasis`/`select`/`blur` — go further, on web and native.

  - A state's own stroke width (`lineStyle.width`) and area fill opacity (`areaStyle.opacity`) apply while that state is active.
  - `emphasis.scale` grows the highlighted point's radius (`true` reads as ECharts' own 1.1); `emphasis.disabled` stops a series from ever highlighting.
  - `emphasis.label` / `select.label` print the datum's label only in that state.
  - `selectedMode: 'series'` pins a whole series with one tap, on `PlotChart`, on web, iOS and Android — the bar/stacked/grouped outline and the line/area/point fill both honour it.
  - `emphasis.blurScope`'s three real values are accepted; an unknown one, `select.disabled`, `select.lineStyle`/`areaStyle`, `blur.label` and a state label's own styling are still named — a pinned datum has no line to stroke, and a blurred one keeps its own label.

  Found on the way:
  - `PlotChart` with `selectedMode` under a zoom window referenced rows a decimated chart never declares on native — fixed for the width-computed selection expressions too.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Axis tick density now follows the chart's size: about one value tick per 40px of plot height (per 80px of width for a horizontal chart's value axis and for a numeric x axis), between 2 and 10. A phone-width chart no longer crowds six labels into 120px, and a tall dashboard chart is no longer left with five. The value domain is rounded to the same step, so the top of the axis is always a labelled tick. Charts whose size differs from the old five-tick sweet spot will show a different number of ticks.

  `<Axis y ticks={n} />` and `<Axis x ticks={n} />` pin the target (`yTicks` / `xTicks` on the spec). Both lower to iOS and Android.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A second x axis whose `data` has the same number of categories as the first is drawn on web and native, as a second set of labels (and its `name` as a title) on the opposite edge. Series may name it with `xAxisIndex: 1`. Any other second x axis warns by name.

- [#3315](https://github.com/pyreon/pyreon/pull/3315) [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Every `@pyreon/charts/plot` host gets the interaction stack.** Seventeen hosts now share one canvas host (`canvas-host.tsx`): `showTitle` / `subtitle`, `showLegend`, `tooltip`, `animate` (an entrance tween honouring `prefers-reduced-motion`), the resize observer, the accessible table and the theme resolution are one implementation instead of seventeen copies — and Treemap, Sunburst, Tree, Sankey, Graph, River, Polar, Gantt, Calendar, Parallel, Map, Funnel, Pie, Radar, Boxplot, Heatmap and Candlestick all draw a title, a legend (where the family has named entries) and a pointer tooltip for the first time. Selection is uniform: every host carries `onSelectIndex` (the engine's index — what the native tap reports) beside its rich `onSelect`; `<RadarChart>` gains a hit test (`hitRadarIndex` → `{ series, axis }`) and so its first `onSelect`.

  Bars are rounded by default: `theme.radius` (3) rounds the corners AWAY from the baseline on plain bars (top for positive, bottom for negative, right/left when horizontal); a mark's own `borderRadius` still wins; `radius: 0` restores square bars. Stacked and grouped segments keep only their mark radii.

  `<PlotChart maxPoints>` thins the visible slice with LTTB on the first mark when it exceeds the cap (rows stay aligned across marks); hits, tooltips and selection report the GLOBAL index of the row actually drawn.

  `bun run --filter=@pyreon/charts bench:engine` measures layout + render throughput of the engine itself (bars/line/area/points at 1k–100k, treemap, sankey, LTTB), with a command-count correctness gate.

  Native: the compiler warns BY NAME for chrome props a target does not draw yet (`tooltip` / `animate` everywhere; `showTitle` / `showLegend` outside PlotChart / Pie / Radar) and for `maxPoints`, instead of dropping them silently; the rounded default crosses through the generated engine.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The chart toolbox (ECharts' `toolbox` model) works on web and native.

  - `PlotChart toolbox` gains `magicType` stack / tiled, a box-select `dataZoom` with a back button, and a data view of the chart's table.
  - On iOS and Android, every tool lowers onto the chart host. `saveAsImage` opens the share sheet, or hands `onSaveImage` a PNG data URL, on the plot host and on the family charts (pie, heatmap, sankey, …).
  - A custom `myTool`, whose `onclick` is a function, and a y-axis box zoom are named in a warning, not silently dropped.

  Also fixed:
  - Two charts on one native screen with zoom state no longer declare the same SwiftUI state twice.
  - `describeChart` no longer indexes past an empty category list, which crashed Android on a chart without categories.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A second value (or time) x axis maps on web and native: a series with `xAxisIndex: 1` is placed at its own x positions over that axis's domain, whose ticks and title sit on the opposite edge, and the accessible data table prints those positions.

- [#3531](https://github.com/pyreon/pyreon/pull/3531) [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The visualMap is interactive on web and native. A `calculable` continuous strip has two handles that drag the in-range interval, and a piecewise strip's swatches toggle their pieces. Values outside the selection take `inactiveColor` (`#ccc` by default). `range` and `selected` set the initial selection. The heatmap, calendar and map hosts draw the strip and own the gesture: `<HeatmapChart visualMap>`, `<CalendarChart visualMap>`, `<MapChart visualMap>` with `onVisualMapChange`, each built with the `visualMap({ domain })` builder. Native builds the strip at compile time and keeps the selection in host state. The strip geometry, hit tests and colouring rule are one engine module shared by every target.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `xAxis.inverse: true` runs the x axis right to left, on web and native. Category charts reverse every per-datum channel together, and hits still report the original datum index. A continuous x axis inverts through its domain.

- [#3530](https://github.com/pyreon/pyreon/pull/3530) [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `yAxis.inverse: true` draws the value axis upside down, on web and native. The engine's `Domain` gained an `inverse` flag honoured by the linear scale, so marks, ticks and hit-testing all invert together. Stacked bars and filled areas now build their geometry through the scale, so they invert too.

- [#3424](https://github.com/pyreon/pyreon/pull/3424) [`a3e9994`](https://github.com/pyreon/pyreon/commit/a3e9994189c98223ff442435dc783b5c96194082) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Kotlin co-source gate reports whether the behaviour test actually RAN

  `verify-kotlin` builds a JAR and runs its smoke `main()` through `java`. With no
  JDK on PATH it degrades to compile-only, warns on stdout, and exits 0 —
  and `check-native-cosource` discards a successful child's stdout, then reported
  `(compiled + ran test)` purely because a `*Test.kt` FILE existed.

  So on any machine without a JDK, every Kotlin behaviour assertion in the repo
  was typecheck-only while the log said otherwise. Measured on a macOS laptop:
  **43 of them.** The warning that was supposed to prevent this was added after a
  `@pyreon/flow` selectAll/deleteSelected divergence shipped past exactly this
  line — it just had nowhere to be seen.

  Three changes: the skip marker is a shared token both halves read; the gate
  reports the outcome it observed rather than the one the file layout implies; and
  `smokeRuns` joins the verdict-cache key, so a compile-only pass can no longer be
  replayed as a behaviour pass (the cache is restored across CI runs, so one
  JDK-less runner would have retired the behaviour tests permanently). The ubuntu
  CI step now sets `PYREON_REQUIRE_NATIVE_VALIDATE=1`, making a missing JVM a
  broken runner rather than a passing gate.

  Note this invalidates existing cached verdicts once — the key gained a
  component, so every Kotlin co-source verdict is re-derived on the next run.

- [#2782](https://github.com/pyreon/pyreon/pull/2782) [`ea67510`](https://github.com/pyreon/pyreon/commit/ea675109d5977a92fe75fa6298c53cede3ebb4d9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Build tooling: the per-service Kotlin verification list is now DERIVED from the sources and runs in parallel with a content-addressed verdict cache, replacing three hand-maintained `&&` chains that had drifted (8 services were verified by only one of `build` / `test` / `typecheck`).

  No shipped content changes — the package's `files` is `src`, `README.md`, `LICENSE`, and only `scripts/` and `package.json`'s script strings were touched.

- [#2786](https://github.com/pyreon/pyreon/pull/2786) [`02c2bd9`](https://github.com/pyreon/pyreon/commit/02c2bd9140968826fb1251f818dc5bb919e5ba78) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/a11y`'s `announce(...)` works on iOS + Android, and its native runtime is **co-located in the package** (`@pyreon/a11y/native/{swift,kotlin}/`) — the per-package architecture, not the monolithic `@pyreon/native-runtime-*`.

  **Runtime (co-located) — `PyreonA11y`:**
  - Swift: `announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
  - Kotlin: `announce(message, assertive)` routes to a registered announcer (`PyreonA11y.setAnnouncer { rootView.announceForAccessibility(it) }`), the "Android needs a host" seam — a safe no-op before wiring.

  Ships in `@pyreon/a11y/native/`, declared via the `pyreon.native` field, so `pyreon-native wire` aggregates it from the installed package. The co-source verify gate (`scripts/check-native-cosource.ts`, wired into native-validate CI) compiles + smoke-runs it against the stub harness — the Kotlin announcer seam is asserted, the Swift wrapper typechecks.

  **Lowering:** `announce("m")` → `PyreonA11y.announce("m", assertive: false)`; `announce("m", { politeness: 'assertive' })` → `assertive: true`. Message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the `expr-utils` walkers + `infer-type`.

  The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, `announce` excepted).

  Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonA11y` stubs on swiftc + kotlinc); `native-a11y.test.ts` 7 cases + the co-source gate. Full native-compiler suite 2818 pass (fixing two tests that had encoded the old "announce warns" behavior). No device proof yet; `politeness` isn't distinguished on Android.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle native-safe geographic point and path overlay geometry into the generated Swift and Kotlin chart runtimes.

- [#3588](https://github.com/pyreon/pyreon/pull/3588) [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Android charts draw their text at the right size. The chart canvas paints under `scale(density)`, and the native canvas it draws text through carries that transform, but text size and the label halo's stroke were multiplied by the density again. Text came out density² — about 2.6× too large on a 420dpi phone — while layout measured it at 1×, so axis labels overlapped each other and the dataZoom strip.

- [#3683](https://github.com/pyreon/pyreon/pull/3683) [`ab42b2c`](https://github.com/pyreon/pyreon/commit/ab42b2c82195ad8a875a3a639454a7d836926489) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Optional narrowing now lowers on iOS and Android.

  A branch TypeScript narrowed — `books === undefined ? <Loading/> : <List books={books}/>`, `{sel() && <Detail item={sel()}/>}`, `if (b.tags) { … b.tags.length }`, `if (b === undefined) return 0; return b.title.length`, `s ? s.length : -1` — reads an unwrapped binding on both targets. Swift, which never narrows through a nil test, gets `if let` / `guard let` / `x.map { x in … } ?? fallback`; Kotlin, which smart-casts only parameters and locals, binds a signal, a computed or a data-class `var` field with `when (val x = …)`, `x?.let { x -> … }` or `val x = … ?: run { … }`. The subject may be an identifier, a signal or computed read, or a member chain. Truthiness on a string, number or boolean keeps JS semantics (the empty string, `0` and `false` take the falsy branch). Before, only a bare identifier in a value ternary or a statement `if` narrowed, and only on Swift; every other shape failed to compile on one target or both.

  A branch that writes the narrowed value, or re-declares its name, is not rewritten and warns by name.

  The generated native chart engine (compiled from the same sources) is regenerated: its early-return and member guards now bind with `guard let` / `when (val ...)` instead of re-reading the optional.

- [#3694](https://github.com/pyreon/pyreon/pull/3694) [`6250032`](https://github.com/pyreon/pyreon/commit/6250032a88299dbf1208904ac7596afa0cd0be83) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rewrote all six READMEs against current source. Every one still described a Phase-0/A4/C1/C2 implementation state and claimed `PRIVATE / EXPERIMENTAL, not published to npm` — false since the native stack was made publishable. No runtime changes.

- [#2727](https://github.com/pyreon/pyreon/pull/2727) [`2b5be05`](https://github.com/pyreon/pyreon/commit/2b5be059737e000aa8ccd7d481242816f235075e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `repository` field npm provenance requires. All six packages were
  rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
  publishing validates the field against the OIDC attestation, so its absence
  is a publish blocker, not cosmetic metadata.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The generated chart engine draws segment annotations and `average` point markers — the twins of the web renderer's new paths.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The generated chart engine lays out and draws polar scatter series.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The generated chart engine draws scatter datum symbols and opt-in line datum symbols.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The generated chart engine's `tooltipAt` lists a series' extra tooltip dimensions under its value, and the accessible table prints one column per extra.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreonTransposeCmds` — the draw-list transpose behind vertical sankey / calendar / parallel charts, the twin of the web engine's `transposeCmds`; parity with the web and between the two runtimes is asserted by execution.

- [#2778](https://github.com/pyreon/pyreon/pull/2778) [`ff73c97`](https://github.com/pyreon/pyreon/commit/ff73c97c74a8d668acc7b6a8ad74aa2484c77c49) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location.

  The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

  `@pyreon/native-cli` gains a `wire` command and a resolver:

  - `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
  - Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
  - `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

  Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

  iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.

- [#2784](https://github.com/pyreon/pyreon/pull/2784) [`5fc3b9f`](https://github.com/pyreon/pyreon/commit/5fc3b9fda70b8d96a412b08f7e58e6e0df35e8fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/toast` works on iOS + Android — and its native runtime is **co-located in the package** (`@pyreon/toast/native/{swift,kotlin}/`), the per-package architecture rather than the monolithic `@pyreon/native-runtime-*`. This is the first package to prove that model end-to-end.

  **Runtime (co-located) — `PyreonToast`** (Swift `@Observable` singleton / Kotlin `object`): a process-global observable queue (add/dismiss/remove/clear), newest-last, distinct monotonic ids, a bounded stack (drops the oldest past `maxToasts`), and an auto-dismiss timer. It ships in `@pyreon/toast/native/`, declared via the package.json `pyreon.native` field, so `pyreon-native wire` aggregates it into a native app build straight from the installed package — no monolith, native tree-shakes to what you import, and a third-party package can follow the same convention.

  **Co-source verify gate** (`scripts/check-native-cosource.ts`, wired into the native-validate CI job): scans every package's `pyreon.native` sources and compiles + smoke-runs them against the stub harness (Kotlin via `verify-kotlin --source`, which gained a path override; Swift via `swiftc -parse-as-library` + run), so a co-located `.swift`/`.kt` can't rot silently now that it lives outside `@pyreon/native-runtime-*`'s own `src/`. Toast's queue behavior is unit-tested this way on both toolchains.

  **Lowering:**
  - `toast("msg")` → `PyreonToast.shared.add("msg", type: "info")` (Swift) / `PyreonToast.add("msg", "info")` (Kotlin). The message is any expression; a renamed import (`toast as notify`) is handled; a literal `{ duration }` (ms → the auto-dismiss; `0` = persistent) lowers.
  - Preset methods `toast.success/error/warning/info/loading("msg")` select the type.
  - `<Toaster />` → a native overlay iterating the reactive queue.

  A new `toast-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/toast` import) + both emits + the `expr-utils` walkers + `infer-type`. Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonToast` stubs on swiftc + kotlinc); `native-toast.test.ts` 7 cases + the co-source gate.

  **v1 scope (disclosed):** message + preset type + literal `duration` lower; the other options (`onDismiss`/`description`/`icon`/`action`) are dropped, and `toast.promise()` / `toast.update()` aren't lowered. `<Toaster />` is a minimal message stack (positioning/styling/animation are a follow-up). No device (Simulator/Emulator) proof yet — the runtime is unit-tested by the co-source gate and the emit is stub-typechecked.

- [#3750](https://github.com/pyreon/pyreon/pull/3750) [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Schema-bearing native modules now compile TOGETHER. PMTC used to emit `PyreonSchemaError` (and `PyreonParseResult`) into every file that declared a schema, so two such files in one Xcode target or Gradle source set failed with `invalid redeclaration` / `Redeclaration` even though each compiled on its own. Both types now live in the native runtime (`PyreonSchema.swift` / `PyreonSchema.kt`) and are declared once. An app must link the updated `@pyreon/native-runtime-swift` / `-kotlin`; emitted code from this compiler no longer declares them.

  `Pet.safeParse(value)` now lowers when `value` holds a typed struct or data class (a signal read, a variable, a call), and when a typed value sits inside an object-literal argument. It is converted through the value's own `Codable` / `@Serializable` encoding by the new runtime helpers `pyreonSchemaInput` / `pyreonSchemaValue`. Previously the whole-value form did not compile, and the nested form compiled but rejected valid data.

  A schema's nested structs now follow a value/type rename: `PyreonZodSchema_BookValue_Author` instead of `PyreonZodSchema_Book_Author` beside `PyreonZodSchema_BookValue`.

  New: `validateSwiftFilesWithStubs` / `validateKotlinFiles` compile several emitted files as one module, the only check that can see a collision between files. `@pyreon/lathe`'s verify uses them when present and reports the result as `report.modules`; a failure there makes the report `broken`.

- [#2779](https://github.com/pyreon/pyreon/pull/2779) [`9d40d85`](https://github.com/pyreon/pyreon/commit/9d40d85f43002f9b53c3cb83236f4a92ba66418b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PyreonQuery — the native cached data-fetching runtime, the core of `useQuery` on iOS and Android.

  The delta over `PyreonFetch` is exactly what a query library adds over a bare fetch: a **keyed cache with stale-while-revalidate**, so the same `queryKey` shared across screens serves instantly and refetches in the background.

  - `PyreonQueryCache` — a process-global cache shared across every `PyreonQuery` instance (two screens reading `["todos"]` hit the same entry). `invalidate(key)` + `clearAll()`. Swift: `@unchecked Sendable` + `NSLock`; Kotlin: `synchronized` `HashMap`.
  - `PyreonQuery<T>` (`@Observable` / Compose `MutableState`) with the web `useQuery` result contract: `data` (nil until first success), `error` (last failure, nil on success), `isPending` (true only when there is NO data yet AND a fetch runs — a background refresh does NOT flip it, so shown data never blanks), `isFetching` (any in-flight fetch), `refetch()`. `begin`/`resolve`/`reject` mirror `PyreonFetch`, so it drives from the compiler-emitted async harness; `resolve` writes through to the cache. Coroutine-free — the network call is injected — so it stays dependency-light and synchronously unit-testable with a stub fetcher.

  Both runtimes build + pass their unit tests (Swift `swift test`: 4 PyreonQuery cases; Kotlin `verify-kotlin --service=PyreonQuery`: typecheck + smoke) and join the per-service verify + service-coverage gates.

  Deferred (disclosed): mutations, infinite queries, prefetch, cross-instance invalidation, retries/backoff, persistence, and bounded cache eviction. The `useQuery` **compiler lowering** (emitting `PyreonQuery` from `useQuery(() => ({ queryKey, queryFn, staleTime }))`) is a tracked follow-up; until it lands, `useQuery` still warns as unsupported on native — this PR ships the runtime it targets.

## 0.51.0

### Minor Changes

- `geo.start()` compiled on iOS and web and failed to build on Android. (ed5eff8)

  Swift's `PyreonGeolocation.start()` is 0-arg. Kotlin's only overload took a host
  closure — `start(register: (GeolocationHandlers) -> (() -> Unit))` — because
  taking a real location source would drag the Android SDK into a file that must
  stay stub-verifiable. So the SAME source built for two targets and not the
  third, silently, with no warning: the documented "OkHttp-for-WebSocket
  asymmetry".

  That was not academic. `native-counter-android` compiles the SAME `Counter.tsx`
  as `native-counter-ios`, so geolocation could not be added to the shared counter
  example at all — which is why the maps/geolocation matrix row could not be
  raised by a device test even with the runtimes present and the harness working.

  Closed with the seam this runtime already uses twice: a registry plus an
  `installDefault…` guard that only fills an EMPTY slot, mirroring
  `PyreonStorageRegistry` / `installDefaultStorageBackend`. An app that chose its
  own source in `Application.onCreate` is never overwritten.

  The Android-SDK half lives in its own file (`PyreonGeolocationAndroid.kt`).
  That is a gate decision, not a style one: `run-kotlin-tests.ts` EXECUTES only
  modules importing no `android.*` / `androidx.*` / `kotlinx.*`, so folding it
  into the core would silently drop the whole class out of the executing test set
  — the same split already used by `PyreonDatabaseAndroid` and
  `PyreonStorageAndroid`.

  With no source installed, the 0-arg `start()` fails LOUDLY through the same
  error channel a denial takes. A silent no-op would leave `latitude` null forever
  — indistinguishable from "no fix yet", the harder bug to diagnose — so the error
  names the wiring call instead.

  Uses the platform `LocationManager` rather than Play Services'
  `FusedLocationProviderClient`: fused lives in a separate Google dependency this
  runtime does not take, and taking it would force it on every consumer. An app
  wanting fused assigns `PyreonGeolocationRegistry.source` with its own
  implementation — which is what the seam is for. `applicationContext` is used
  internally so a rotated-away Activity is never retained by a running watch, and
  `hasAccuracy()` guards the platform's 0.0 sentinel rather than reporting it as a
  real 0-metre fix.

  The kotlinc stub now mirrors BOTH overloads. Mirroring only the 0-arg one would
  be a SUBSET stub, which manufactures failures for the closure form exactly as an
  over-strict `PyreonPermissions` stub rejected correct code.

  Bisect-verified: reverting the stub reproduces `unresolved reference 'start'` —
  the literal Android build failure. Full compiler suite 245 files / 2501 tests;
  Kotlin runtime smoke tests 8/8; duplicate-declaration gate clean across 87
  top-level declarations.

- `useFieldArray` lowers to native on both targets — dynamic form lists with (9590027)
  stable keys, device-proven.

  - **Runtimes**: `PyreonFieldArray` (Swift `@Observable` / Kotlin
    `SnapshotStateList`) mirrors the web `@pyreon/form` surface one-for-one:
    `items` (keyed rows), `length`, `append`, `prepend`, `insert`, `remove`,
    `update`, `move`, `swap`, `replace`, `values`. Keys are monotone and never
    reused — a removal never re-keys survivors (row identity/focus survives),
    `replace` always re-keys. Byte-aligned contract suites on both platforms.
  - **Compiler**: `useFieldArray(['a'])` lowers on both targets (String-
    specialized v1 — the PMTC form vocabulary is String-typed; initial must be
    an array literal, the useWebSocket literal rule). The load-bearing seam is
    the ACCESSOR UNWRAP: on web `tags.items()` / `tags.length()` /
    `item.value()` are signal calls, natively they are properties — the emit
    strips the parens (For-item params tracked through
    `<For each={tags.items()} by={i => i.key}>`, which lowers to
    `ForEach(tags.items, id: \.key)` / `items(tags.items, key = { it.key })`),
    and the validate stubs mirror the property shape so a paren-keeping emit
    fails both toolchain gates by construction. `move` emits with Swift labels
    (`move(from:to:)`).

  Device-proven in router-demo on both platforms (add renders the row,
  remove-first drops exactly row 0 with the survivor still rendered, count
  tracks length) and bisect-verified by no-oping the runtime `remove()` on
  both.

- Give `useOnline()` a real connectivity monitor on Android, and make the database presence check compile. (d62ce1a)

  - **`useOnline()` on Android reported `true` forever.** `PyreonNetworkStatus` shipped as a pure state container defaulting to online, with a `start(register)` seam for the app to wire its own `ConnectivityManager.NetworkCallback` — and nothing wired it, so the hook could not report the device's real state no matter what the radios did. A new `rememberPyreonNetworkStatus()` self-installs a real callback (seeded from the current state, torn down on leave, degrading to the optimistic default if `ACCESS_NETWORK_STATE` is missing rather than crashing). An app that wants different semantics still calls `start()` with its own registrar. Same shape as the geolocation registry fix: a default that requires a step nobody takes is not a default.
  - **`const found = db.get(c, id); if (found) { … }` compiled on neither target.** Reading a row and branching on whether it exists is the single most common database shape, and `db.get`'s optional record return had no inference model, so the condition emitted a bare optional — swiftc "optional type 'PyreonRecord?' cannot be used as a boolean", kotlinc "condition type mismatch". `database.get` now joins `SERVICE_METHOD_RETURNS`, which also gives Swift the `if let` binding so the body sees the unwrapped value.

  - **Compose state was written from background threads, crashing layout-heavy screens.** Android delivers `ConnectivityManager.NetworkCallback` on a binder thread and OkHttp delivers `WebSocketListener` callbacks on its reader thread. Both drive Compose `MutableState`, so both raced the UI thread's measure/layout and made Compose throw `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`. It is load-dependent, so it does not fail every run — it surfaced as a 10,000-row lazy-list test failing while nineteen siblings passed, in an app whose only change was adding `useOnline()`. Connectivity callbacks now register with a main-looper `Handler`, and the OkHttp transport hops every listener callback to the main thread. `PyreonGeolocationAndroid` already did this correctly; the two new call sites had simply diverged from it.

  The first two were found by writing the natural offline-first shape for the Offline/sync matrix row and bisect-verified on device. The threading bug was found BY the device gate; its WebSocket twin was found by auditing the same shape rather than by a failure of its own — no compile-level gate can see either, since the emitted Kotlin typechecks clean with the bug present.

- `useSecureStorage` is real on all three targets — the encrypted secret store (9590027)
  (iOS Keychain / Android Keystore AES-GCM / web in-memory), device-proven.

  The sub-capability was three-quarters missing: the PMTC emit was a warn-drop
  ("deferred v1"), the Kotlin runtime shipped no real backend (in-memory only,
  behind an app-injection requirement the compiler could not satisfy), and the
  web half did not exist, so the shared import resolved on neither web app.

  - **`@pyreon/native-runtime-kotlin`**: `KeystoreSecureBackend(context)` —
    AndroidKeyStore AES-256-GCM over app-private SharedPreferences (no new
    gradle dependency; androidx security-crypto is deprecated and wrapped
    exactly this surface) + a `PyreonSecureStorage(context)` factory, the
    `PyreonDatabase(context)` shape. Fail-closed reads (tampered/undecryptable
    → null).
  - **`@pyreon/native-runtime-swift` + `-kotlin` (BREAKING, pre-1.0)**:
    `write` is now KEY-FIRST — `write(key:value:)` / `write(key, value)`. The
    old `write(value, key)` order was a live hazard: both parameters are
    String, so a positional lowering of the natural TS call
    `sec.write('auth', token)` would have compiled with the arguments crossed
    and stored the secret under the wrong key.
  - **`@pyreon/native-compiler`**: `useSecureStorage()` lowers on both targets
    (Swift `PyreonSecureStorage()` Keychain default; Kotlin Context-threaded
    Keystore default); method calls emit with Swift labels
    (`write(key:value:)`), making a crossed positional call uncompilable.
    Validate stubs mirror the real key-first surface on both toolchains.
  - **`@pyreon/hooks`**: the web `useSecureStorage()` — a module-scoped
    in-memory store (the web has no OS secret store; persisting secrets to
    localStorage would be the exact bug the hook prevents), same key-first
    surface.

  Device-proven in router-demo and bisect-verified on both platforms by
  swapping the defaults to the in-memory backend: iOS's secret survives a
  genuine terminate+relaunch only with the real Keychain; Android's cold
  `PyreonSecureStorage(context)` decrypts the UI's write and the raw prefs
  value is asserted to be ciphertext, not plaintext (encryption at rest).

### Patch Changes

- `useAppState()` now observes the real app lifecycle with zero wiring — the third member of the never-wired class. Swift: the emit calls `PyreonAppState.start()` from `.onAppear` on the stable host (the UIApplication notification observers existed from inception; nothing called them). Kotlin: `rememberPyreonAppState()` installs a `LifecycleEventObserver` on the hosting Activity for the composable's lifetime (ON_RESUME/ON_PAUSE/ON_STOP → active/inactive/background). Both containers gain a sticky `wasBackgrounded` flag — the device-assertable end-state a frozen container can never reach. (a8c9fab)
- A form `onSubmit` that references the form ITSELF — `onSubmit: () => form.setFieldValue('note', '')`, the "clear the field after submit" idiom — now compiles on Android. The Kotlin emit passed `onSubmit` as a constructor argument inside `remember { PyreonForm(…) }`, making the handler body a self-reference in the form's own initializer (`unresolved reference 'form'`), so the shape built on iOS and failed to compile on Android. The emit now assigns `form.onSubmit` after the declaration — mirroring what Swift already did from `.onAppear` — and `PyreonForm.onSubmit` becomes a settable `var`. (8f3b127)
- `useFetch(url, { method, headers, body })` now reaches the wire on iOS and (25b5f5a)
  Android. Every field of that init object was previously read by nobody — the
  native parser only looked at the first argument — so both targets emitted a
  plain GET and an app asking for a POST silently performed the wrong verb with
  no diagnostic anywhere.

  Requests carrying a verb, headers or a body now lower to `PyreonHttp`, which
  had shipped on both runtimes with full verb support and nothing calling it:
  Swift had a live `URLSession` edge no emit reached, and Android had an executor
  interface whose real OkHttp implementation did not exist (`PyreonHttpOkHttp`,
  new here). A non-2xx now rejects rather than being handed to the JSON decoder,
  where it read as "the server sent bad JSON" instead of a 404. Values the
  compiler cannot bake — a computed method, a `JSON.stringify(...)` body — now
  WARN loudly instead of degrading to a GET.

  Two pre-existing breaks in the same container, both fixed here and both hidden
  by the fact that every existing example fetches an array and reads
  `data() ?? []`:

  - a single-object `data()?.field` read emitted `data.field` on Swift, which
    does not compile — the inference reported the container's `data` as
    non-optional even though the web hook, Swift and Kotlin all declare it
    optional, so the member emit stripped the `?.` the author wrote;
  - `error()` in call form inferred `unknown`, so `{f.error() ? … }` emitted a
    bare `Throwable?` as a Kotlin condition ("condition type mismatch").

  `@pyreon/hooks`: `useFetch` takes an optional second argument (`UseFetchInit` —
  `method` / `headers` / `body`), matching the native lowering.

  **`useFetch` decoding on Android now matches iOS.** kotlinx.serialization's
  default `Json` THROWS on a JSON key the target type does not declare; Swift's
  `JSONDecoder` silently ignores it. The emit used the bare default, so the same
  shared `useFetch<T>(url)` against the same server decoded fine on iOS and threw
  on Android the moment the response carried one extra field — i.e. against
  essentially every real API, since a server returning exactly the fields one
  client declares is the exception. Decoding now goes through
  `PyreonFetchJson` (`Json { ignoreUnknownKeys = true }`).

  This was PRE-EXISTING and is not limited to the new verb path — the plain GET
  path decoded the same way. It stayed invisible because the only device-proven
  fetch fixture is a hand-written `quotes.json` whose shape matches its type
  exactly; measured on a real emulator, a 200 response with one extra field
  raised `JsonDecodingException: Encountered an unknown key 'contentType'` while
  the identical iOS run passed.

  Deliberately scoped: `ignoreUnknownKeys` only. NOT `isLenient` (malformed JSON
  is a real error worth surfacing) and NOT `explicitNulls = false`.

- Move OkHttp WebSocket callbacks onto the main thread before they write Compose state. (c8b0cca)

  OkHttp delivers every `WebSocketListener` callback on its own reader thread, and those handlers drive `PyreonWebSocket`'s `MutableState` fields (`isConnected` / `messages` / `lastMessage` / `error`). Writing Compose state off the main thread races the UI thread's measure/layout, and Compose throws `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`.

  The race needs a callback to land while a frame is still laying out, so the same commit passes on one run and fails on the next — which is why it read as flake. It is not: `native-router-demo-android` calls `useWebSocket`, and its device gate fails on `tenThousandRowListIsLazyAndDeepRowReachable` (the frame most likely to still be laying out) with exactly that error.

  Every callback now hops to the main looper. `rememberPyreonGeolocation` already passed `Looper.getMainLooper()` to `requestLocationUpdates`; this call site had diverged from that pattern. No compile-level gate can catch the class — the emitted Kotlin typechecks clean with the bug present — so the device gate is the proof.

- Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it. (6378982)

  A scaffolded multiplatform app declares five `@pyreon/native-*` packages and
  resolves the Swift/Kotlin runtimes **out of `node_modules`** — XcodeGen consumes
  `../node_modules/@pyreon/native-runtime-swift` as a local SPM package, Gradle
  adds `../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a
  source set. So npm is not an incidental channel, it is the required one. With
  every package private, `npm install` could never fetch them: the paths did not
  exist and the native build could not run. That is why multiplatform was
  unusable outside a workspace checkout, regardless of compiler capability.

  Two of the six needed real work, not just a manifest flag:

  **`@pyreon/native-cli` shipped a `.ts` bin.** `bin` pointed at `./src/cli.ts`,
  and the scaffolded builds invoke it as `npx pyreon-native build …` — i.e. under
  **node**. Measured: node cannot execute it even on v26's type-stripping path,
  because the source uses extensionless relative imports (`./build`) that bun
  accepts and node's ESM resolver rejects. Now builds to `lib/` and ships a
  hand-written `bin/pyreon-native.js` that calls `main()` **explicitly** rather
  than relying on `cli.ts`'s `import.meta.main` guard — that guard is Bun-only
  (undefined on Node < 24.2) _and_ is dropped by the bundler, the exact
  combination that shipped `pyreon-lint` as a silent no-op in every published
  version.

  **`@pyreon/native-compiler` had no build at all** — its exports pointed straight
  at `src/index.ts`, so publishing would have shipped raw TypeScript to a
  consumer resolving `import`. Now builds to `lib/` with proper types.

  The four runtime/router packages ship SOURCE by design (Swift files for SPM,
  Kotlin for Gradle) and needed only `publishConfig.access` + `sideEffects`;
  tarball contents verified (Package.swift + Sources; 65 `.kt` files).

  Also fixes `--help`, which exited **1** and printed to **stderr**. For a
  published CLI that breaks any script or CI step checking exit codes, and hides
  usage from a plain `| grep`. Now exit 0 on stdout; error paths unchanged.

  Verified end to end: the built bin runs under **both node and bun**, produces
  byte-identical Swift and Kotlin for both targets, and `check-bin-liveness` now
  covers it — the gate caught the new bin as uncovered and failed closed, which is
  what it exists to do. `publish.ts --dry-run` completes with all six included.

  Nothing is published by this change; it only makes publishing possible.

- `usePush()` now receives notifications with zero app wiring — the receipt half was the never-wired class. Swift: the no-arg `PyreonPushNotifications.start()` (called by the emit from `.onAppear` on the stable host) installs a container-owned `UNUserNotificationCenter` delegate — foreground presentation and taps land in `notificationReceived`, `requestAuthorization` drives `authorize`; `simctl push` exercises exactly this pipeline, credential-free. Kotlin: `rememberPyreonPushNotifications()` registers a NOT_EXPORTED BroadcastReceiver delivery seam on `PYREON_PUSH_ACTION` for the composable's lifetime (an FCM service forwards into the same seam). The APNs token and FCM transport stay app-wired via `start(register)` — the first start of either kind wins. (5abe7c4)
- `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable). (5ca9b4c)
