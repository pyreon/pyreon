# Flow full-parity completion plan

## Meaning of “100%”

Flow is complete only when every public `@pyreon/flow` authoring surface has
one of two tested paths from the same application source:

1. equivalent web, SwiftUI and Compose behaviour through the direct native
   engine; or
2. the unchanged web renderer through the supported Flow WebView host when the
   contract is intrinsically DOM/SVG/CSS/JavaScript-driven.

A warning, a successful emit, or a stub compile is not behavioural parity.
Every direct-native claim needs Swift and Kotlin toolchain validation, and every
interactive/rendering claim needs assertions in both device jobs. Browser-only
boundaries must be named at the exact prop/member/field and must have a tested
WebView escape path; silent drops are release blockers.

## Work streams

- [x] **F1 — machine-readable public-surface inventory.** Derive the Flow
  instance, config, node, edge, host, chrome and helper inventories from source.
  Fail when a new public item is neither lowered nor explicitly routed.
- [ ] **F2 — direct state/algorithm parity.** Prove every portable method and
  mutable config field against shared fixtures: CRUD, selection, viewport,
  snapping, connection validation, history, serialization, layout and graph
  queries.
- [ ] **F3 — renderer/chrome parity.** Close static node/edge renderer,
  connection-line, handle, toolbar, resizer, minimap, controls, panel, label,
  marker, theming and animation differences.
- [ ] **F4 — interaction and accessibility parity.** Device-test pointer/touch,
  pan/zoom, connect/reconnect, selection, keyboard equivalents, focus,
  accessibility names/roles and reduced motion on both targets.
- [ ] **F5 — dynamic/browser-rich contract.** Make arbitrary renderer maps,
  arbitrary SVG paths and DOM/CSS custom renderers select the supported
  `@pyreon/flow/webview` path without semantic loss. Device-test messages,
  graph updates, selection callbacks, reload/reconnect and failure states.
- [ ] **F6 — real-app and scale proof.** Exercise large graphs, custom nodes and
  mixed gestures in web Chromium, iOS Simulator and Android Emulator; add
  deterministic performance and memory ceilings without claiming benchmark
  numbers until measured.
- [ ] **F7 — documentation/manifest truth.** Update the manifest, package docs,
  multiplatform matrix and generated references from the measured inventory.

## Exit gate

The completion audit must show zero unclassified public surfaces, zero silent
drops, green real-browser tests, green real Swift/Kotlin compilers, and green
iOS/Android behavioural scenarios for every claimed direct-native category.
The hybrid WebView category is reported separately and is never described as a
native view.

## Progress checkpoints

- [x] Public runtime, instance, configuration, host, component, node and edge
  inventories are source-derived and fail closed when the public surface grows.
- [x] Every lowered mutable configuration field is now asserted by matching
  Swift and Kotlin behaviour fixtures. A source-derived compiler test prevents
  new configuration fields from entering the native inventory without both
  assertions.
- [x] Every handled node and edge field is exercised under its native
  spelling in BOTH targets' fixtures (`class` → `className`, `pathOptions` →
  curvature / borderRadius / pathOffset), ratcheted by a source-derived test.
  The pass surfaced `class` (both targets) and `targetHandles` (Kotlin) as
  registry-only carries; both now have behaviour assertions, and the
  Kotlin smoke runs under a JDK (without one the gate is typecheck-only —
  put one on PATH before trusting a green).
- [x] F7 first pass: the manifest, README, multiplatform pattern doc and
  multiplatform page state what is proven where, name the browser-only
  members (`FlowLayersContext`, `flowStyles`), and no longer list the package
  among those that cannot render natively. Still open under F7: the generated
  reference page carries no native-tier section (a generator change).
- [x] F2 shared fixture: the web engine is now the ORACLE for native state
  parity. `src/tests/native-parity-fixture.ts` holds ten scenarios as data
  (node/edge CRUD, reconnect, single/additive/edge selection, select-all,
  deleteSelected, moveSelectedNodes, zoom steps + clamps + pan + setViewport,
  connection validation, undo/redo across CRUD, node extent + clamping;
  queries over connected edges, incomers, outgoers, screenToFlow,
  clampToExtent). `createFlow` runs them and its observations are emitted
  as literal assertions into marker-delimited regions of BOTH native
  behaviour fixtures, which the co-source gate compiles and runs; the TS
  spec locks both regions byte-for-byte and `PYREON_WRITE_FLOW_PARITY=1`
  regenerates them. Bisect-verified on both targets (a flipped
  `screenToFlowPosition` fails `parity: … query 1 screenToFlow`). Parity
  runs FIRST in each main, so a shared divergence is reported as one. Still
  hand-written only under F2: snapping, serialization round-trips, layout
  algorithms and the container-size-dependent `fitView` / `setCenter`.
- [x] The public `@pyreon/flow/webview` component now lowers to the real native
  WebView bridge instead of an unresolved `FlowWebView` symbol. Its generated
  default host is byte-ratcheted against the web builder; graph updates,
  once-only commands, static host styling, selection/event/message/error
  callbacks, renamed imports, and explicit custom HTML are covered by compiler
  and Swift behaviour tests. Android runtime compilation and both device
  behaviour scenarios remain required before F5 can be checked complete.
