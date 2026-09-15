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

## Exit gate

Zero unclassified core inventory rows; green real-browser conformance; green
real Swift/Kotlin compilation; green iOS/Android behavioural galleries; and
explicit separation of direct-native coverage from hosted-engine coverage.
Third-party extensions are versioned add-on profiles rather than silently
included in the core score.
