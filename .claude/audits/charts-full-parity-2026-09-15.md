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

## Exit gate

Zero unclassified core inventory rows; green real-browser conformance; green
real Swift/Kotlin compilation; green iOS/Android behavioural galleries; and
explicit separation of direct-native coverage from hosted-engine coverage.
Third-party extensions are versioned add-on profiles rather than silently
included in the core score.
