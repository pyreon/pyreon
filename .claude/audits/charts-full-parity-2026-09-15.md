# Charts full-parity completion plan

## Meaning of “100%”

Charts is complete only when its supported option-format contract is measured
against a version-pinned capability inventory. Each item must have either:

1. equivalent behaviour in Pyreon’s web canvas plus SwiftUI and Compose native
   canvases; or
2. exact hosted-engine execution through the supported native WebView host for
   contracts that depend on a JavaScript renderer, extension system or HTML.

The two modes are reported separately. Running a JavaScript chart engine in a
WebView is full hosted-engine compatibility, not a native-canvas claim. Static
option compilation, stub typechecking and drawing one frame are insufficient
for interaction, animation or accessibility parity.

## Baseline inventory

- [ ] **C1 — option/data pipeline:** option merge semantics, dataset,
  dimensions/encode, transforms, progressive/large data and empty/null values.
- [ ] **C2 — series:** line, bar, pie, scatter/effectScatter, radar, tree,
  treemap, sunburst, boxplot, candlestick, heatmap, map/lines, graph, sankey,
  funnel, gauge, pictorialBar, themeRiver, custom and extension series.
- [ ] **C3 — coordinates/components:** grid, polar, geo, calendar, parallel,
  single-axis, axes, visualMap, dataZoom, timeline, title, legend, tooltip,
  toolbox, brush, graphic, aria and mark point/line/area.
- [ ] **C4 — runtime API:** init/dispose/resize, option-update flags, actions,
  events, connected groups, loading, themes, maps, renderer/init options and
  extension registration.
- [ ] **C5 — presentation:** labels/rich text, states/emphasis/blur/select,
  symbols, gradients/patterns, decals, animation/update/universal transition,
  locale, RTL and export/snapshot behaviour.
- [ ] **C6 — native direct engine:** close every statically portable item in
  OptionChart and the typed plot hosts, including composite/timeline options,
  interaction, accessibility and device assertions on both targets.
- [ ] **C7 — exact-engine native host:** expose the real option, event/action,
  resize, theme/map and lifecycle contracts through the WebView bridge;
  device-test both directions and failure/recovery behaviour.
- [ ] **C8 — conformance matrix:** generate tests from the pinned inventory and
  publish separate web, direct-native and hosted-engine scores. No headline
  reaches 100 while an inventory row is missing or only indirectly tested.

## Delivery order

1. Generate the inventory and regression gate.
2. Finish static OptionChart family/component adapters.
3. Finish direct-native interactions, presentation and accessibility.
4. Complete the exact-engine bridge runtime API.
5. Run browser plus iOS/Android conformance galleries and update documentation.

## Progress checkpoints

- [x] Versioned, machine-readable capability ledger with separate direct and
  hosted scores, evidence paths, and a regression test that prevents a false
  100% direct score while partial or pending rows remain.
- [x] Public `ChartWebView` lowering for Swift and Kotlin, including generated
  host freshness, reactive option/command/loading envelopes, reverse
  selection/event/error routing, source-ratcheted prop totality, and native
  runtime helpers. This closes the previous unresolved-component build gap;
  device behaviour remains part of C7's exit gate.
- [ ] Universal transitions: the direct web canvas now morphs differing
  command kinds and growing/shrinking item sets behind the explicit
  `universalTransition` prop. Native canvas state/timing and device evidence
  are still required before this row can be marked complete; the ledger row
  is `partial` for exactly that reason (compile-time parity only).
- [x] Hosted connected groups (`<ChartWebView group>`): the last pending
  hosted row. Every hosted chart is its own page, so the relay is a generic
  `<WebView>` host group (web iframes, WKWebViews, Android WebViews all speak
  the same reserved protocol); real-Chromium proof across separate pages,
  compiler proof on both targets. Hosted ledger: 11/11.
- [x] Vertical orient on every target: `<SankeyChart>` / `<CalendarChart>` /
  `<ParallelChart>` take `orient="vertical"` (and the option facade's
  `series.orient` / `calendar.orient` / `parallel.layout`), implemented as ONE
  mechanism — the horizontal layout in the box reflected across the diagonal,
  the draw list reflected back, the pointer reflected before its hit. The
  transpose exists three times (web `transposeCmds`, `pyreonTransposeCmds` in
  both runtimes) and is locked by execution like the RTL mirror. Rows
  `series.sankey`, `coordinates.calendar`, `coordinates.parallel` complete.
- [x] `encode.tooltip` (web): the dataset columns named by `encode.tooltip`
  become `Series.extras` (numbers as values, texts as text); the engine's
  `tooltipAt` lists them under the value and the accessible table prints one
  column per extra, so the reader who cannot hover gets the same numbers.
  Both are generated into the native engines and the emitters carry
  `extras` through `TooltipSeries`.
- [x] Datasets cross natively: the `<OptionChart>` desugar runs the web
  facade's own `resolveDataset` (the new `@pyreon/charts/option-layer`
  subpath, a pure module) over a literal option at compile time — `source` /
  `dimensions` / `sourceHeader`, `datasetIndex` / `datasetId`, `encode`
  (x / y / itemName / seriesName / tooltip) and the built-in `filter` /
  `sort` transforms — and hands the materialised series, category axis and
  tooltip extras to the existing lowering. One resolver, three targets.
  `data.dataset` and `data.dimensions-encode` are complete on that proof;
  `data.transforms` stays partial (a REGISTERED transform lives in the page's
  registry and is named as web-only), as does `data.progressive-large` (the
  `sampling` / `large` spellings do not cross; `<PlotChart maxPoints>` is the
  native decimation). Before this, all four rows had been marked complete on
  the strength of the web facade alone while the native desugar named
  `option.dataset` as not crossing and emitted nothing.
- [ ] `series.pictorial-bar` (silent-drop closed, row still partial): the
  accepted-but-unmapped pictorial keys (`symbolClip`, `symbolMargin`,
  `symbolBoundingData`, `symbolOffset`, `symbolPosition`, `symbolRotate`)
  warn by name now; mapping them needs engine work in both bar orientations
  (clipped partial symbols, margins, a bounding reference for the repeat).
- [ ] `presentation.gradients-patterns`: ECharts' LINEAR gradient objects on
  every colour slot now resolve to the series gradient (direction from the
  dominant axis, a backwards ramp reverses its stops, the first stop is the
  solid colour) on web and — through the mark `gradient` option the emitters
  now carry, for `<OptionChart>` and `<PlotChart>` alike — on both native
  targets. Decals were already complete. Still open: radial gradients, which
  warn by name and degrade to their first stop (the engine draws linear
  ramps only; a radial form touches every draw-list executor).
- [x] `presentation.symbols` complete: the datum symbol vocabulary the
  pictorial bars already had (rect / circle / diamond / triangle) now applies
  to scatter datums and, on `showSymbol: true`, to a line's datums, with
  `symbolSize` as the diameter; `roundRect` and `emptyCircle` alias, the
  path / `pin` / `arrow` / `none` spellings warn by name and draw circles.
  Same engine branch on every target (regenerated; Swift builds, the Kotlin
  runtime verifies uncached).
- [x] `coordinates.single-axis` complete: ECharts itself places only scatter /
  effectScatter and the theme river on a single axis, and the arm now honours
  exactly that. Found on the way: a theme river declared with
  `coordinateSystem: 'singleAxis'` — ECharts' REQUIRED spelling — was keyed by
  its coordinate into the scatter arm and skipped with a warning; families are
  keyed by type first now.
- [x] `coordinates.polar` complete: scatter / effectScatter join bar and line
  on the polar coordinate (points at the line placement, circles only, the
  symbol radius) on web, iOS and Android. Found on the way: a polar option
  with no value extent emitted a `categories`-only axes literal that struct
  selection could not type, so the native emit did not compile — `categoryOn`
  is now always stated.
- [x] `coordinates.mark-line` / `coordinates.mark-point` complete: the engine
  gains segment annotations (`x1`/`y1`/`x2`/`y2`) and `average` markers (the
  datum nearest the mean, ECharts' placement), regenerated into both native
  engines; the facade resolves `median`, `[from, to]` pairs (statistics,
  coords, axis pairs), category-named coords, `value` labels, per-mark and
  mark-level colours and sizes; the native OptionChart desugar runs the same
  resolution at compile time over the literal series. Unplaceable marks are
  named on every target.
- [x] C2 `series.line` complete: stacked lines sit on the running total of
  their `stack` group (gaps carry the total), stacked areas are the engine's
  `stackedArea` kind — the last live warning on that row is gone.
- [x] C4 `runtime.events` (direct) complete: `onClick` / `onDoubleClick` /
  `onContextMenu` (datum under the pointer, -1 for a miss, whatever
  `selectedMode` says) and `onRendered` join `onSelect` / `onHighlight` /
  `onLegendChange` / `onZoom` / `onBrush`, proven in real Chromium; they are
  named as web-only on native (a tap is a pick, a native canvas has no paint
  callback). `runtime.actions` gains `showTip` / `hideTip` /
  `legendAllSelect` / `legendInverseSelect` (the handle now tracks the bound
  chart's series count) and stays partial on brush / timeline / visualMap /
  roam actions.
- [x] C1 `data.option-merge` and `data.progressive-large` complete: the merge
  policy speaks `setOption`'s spelling (`notMerge`, a true `replaceMerge`,
  `lazyUpdate`, `silent`); `sampling` / `large` / `progressive` resolve to
  bounded decimation on shared rows (the engine's one large-data mechanism,
  stated as such rather than claimed as chunked rendering).
- [x] C1 `data.transforms` complete: the ECharts dataset contract end to end —
  built-in filter/sort, `registerChartTransform` in the `echarts.registerTransform`
  shape (ecStat transform objects register unchanged), multi-result transforms
  through `fromTransformResult`, `id` / `datasetId` / `fromDatasetId`.
  `data.dimensions-encode` gains `seriesName` and `itemName`; it stays partial
  on `encode.tooltip`, which now warns by name instead of vanishing.
- [x] Silent-drop class closed for the literal-only chart flags: `dataZoom`,
  `navigator`, `brush`, `horizontal`, `universalTransition` and
  `updateAnimation` warn by name on both targets when present but not
  statically resolvable (they lowered as off with no diagnostic). Reactive
  lowering of those flags remains C6 work.
- [x] Ledger honesty pass: every direct row whose engine still emits a live
  "not supported" warning for a contract member is `partial`, with the
  warning site as its evidence (`series.line` stacked lines, `series.sankey`
  vertical, `coordinates.polar` bar/line only, `calendar`/`parallel`
  vertical, `single-axis` scatter only, `axes` one x / two y, `visual-map`
  calculable handle, `graphic` element types, `mark-point` / `mark-line`
  shapes). Direct ledger after the pass: 31/62 rows. The score is derived
  from the rows; nothing hand-types a headline.

- [x] `data.progressive-large` complete: the native `<OptionChart>` runs the
  web facade's own decimation (`samplingRequest` / `decimateShared`, exported
  from `@pyreon/charts/option-layer`) at compile time — `sampling` to the
  option's static width (its `width` prop, or the web's own 640 default),
  `large` / `progressive` to their thresholds; a native spec asserts the
  thinned rows are the rows the web keeps at that width, and both toolchains
  compile the emit. A negative literal datum used to make the whole option
  emit nothing on native (`litNumber` read only plain literals); fixed and
  locked.
- [x] `presentation.gradients-patterns`: radial gradients are an engine fill
  (`ChartGradient.radial`, `SeriesGradient.shape: 'radial'`) on the web
  canvas, SVG, and both native runtimes (mirror / transpose parity corpora
  carry a radial polygon; real-Chromium pixels are asserted centre vs edge);
  the option facade keeps every stop of a radial ECharts colour. The row
  stays partial on IMAGE patterns (`color: { image }`), which now warn by
  name instead of silently painting the palette colour.

- [x] `presentation.states` (still partial, narrowed): ECharts' `emphasis` /
  `select` / `blur` FILLS and `emphasis.focus` blur are engine fields
  (`Series.emphasisColor` / `selectColor` / `focus` / `blurOpacity`, applied
  through one `stateFill` at every bar and point site, so the generated
  engines carry them); `<OptionChart>` now hovers (highlight) and pins per the
  series' `selectedMode` on the web host, and the native desugar lowers the
  same four fields plus `selectedMode` as the host's tap-to-pin state. Named
  by name: state labels, symbol scale, `blurScope`, whole-series selection;
  the engine's highlight is a datum COLUMN, so `focus: 'series'` dims the
  other columns like `self`. Fixed on the way: `<SingleAxisChart>` mounted no
  tooltip node at all (the host sweep's one red row on the base branch).

- [x] `series.pictorial-bar` complete: the six accepted-but-unmapped keys are
  engine geometry (`engine/pictorial.ts` — unit cells with margin, a
  position along the bar, a rotation about each cell, polygon-∩-rect
  clipping, and a bounding datum that sizes the run so the bar shows the
  covered fraction), filled by the facade and lowered by the native desugar
  (a `numbers` mark-option kind carries `symbolOffset`); percent strings and
  an unknown position warn by name on both sides.

- [x] `coordinates.graphic` complete: the element geometry moved into its own
  engine module (`engine/graphic.ts`) and gained the shapes ECharts draws
  without a bitmap — `arc` (an open stroked edge, not a closed sector),
  `ring`, `sector` and `bezierCurve` (quadratic and cubic, sampled). The
  facade resolves each element's position and hands the engine a flat,
  absolute description; the native desugar resolves the SAME way at compile
  time through `@pyreon/charts/option-layer` and both emitters append
  `graphicDrawCommands(...)` to the host's draw list. An `image` element
  warns by name. Two native-subset lessons: a second module-level `TAU`
  collides once every engine module is flattened into one namespace, and
  `Math.floor(list.length / 2)` is a Double, so an Int loop bound has to come
  from the list itself.

- [x] `presentation.labels-rich-text` complete: labels are an engine module
  (`engine/labels.ts`) — `\n` breaks a line, `{name|text}` takes a named rich
  style, and a block of lines anchors where a one-line label would. A PLAIN
  label still emits exactly one text command, so nothing regresses for the
  common case. The facade resolves the `{a}`/`{b}`/`{c}`/`{d}` template (and
  calls a function formatter) per datum, because it is the only layer that
  knows the series name, the category and the share; the native desugar
  resolves the SAME way at compile time and carries the finished strings plus
  the colour, size and rich styles. A function formatter cannot run at compile
  time and is named. Two more native-subset lessons: there is no two-argument
  `indexOf` and no zero-argument local-closure call, and an array local is a
  Kotlin `val` — so it can never be REASSIGNED (the scanner became a per-line
  helper that only ever pushes).

- [ ] `coordinates.axes` narrowed (still partial): an axis `name` is its
  title, `show: false` hides it, `yAxis.splitLine.show: false` drops the
  grid, and `type: 'log'` is the log scale, on web and native. Natively the
  right axis now crosses — `yAxis` as an array carries index 1's domain and
  title, and `yAxisIndex: 1` scales a series on it (it was a warned drop).
  Unmapped per-axis keys and a one-sided min/max are named, where they were
  silently ignored. yAxis.inverse is an engine feature: Domain.inverse makes
  scaleLinear map min to the far end, so marks, ticks and hit-tests invert
  together and native gets it through the generated engine. A stacked bar and
  an area built geometry without the scale and were fixed. xAxis.inverse over
  categories reverses the data once in geometrySpec and maps hit indices back
  (categoryIndex); a continuous x uses the domain flag. Position: x top and a
  lone y right move the label band in layout; two y axes with the first placed
  right swap and yAxisIndex follows. Offset moves each axis off its edge and
  grows the gutter. A third and later y axis is ChartSpec.extraYAxes; every
  left/right domain choice goes through seriesDomain. Open: a second x axis.

## Exit gate

Zero unclassified core inventory rows; green real-browser conformance; green
real Swift/Kotlin compilation; green iOS/Android behavioural galleries; and
explicit separation of direct-native coverage from hosted-engine coverage.
Third-party extensions are versioned add-on profiles rather than silently
included in the core score.
