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

- [x] F3/F4 first device evidence: the tasks example now renders a real
  `<Flow>` canvas with `<Background>` / `<Controls>` / `<MiniMap>`, and BOTH
  device lanes assert it — the canvas and minimap exist by accessibility
  name, the Controls' zoom-in drives the engine to its `maxZoom` clamp
  (read back through the app's own label), and Fit view runs. Android
  additionally DRAGS a node through Compose and asserts the engine moved it.
  Two renderer bugs fell out, both device-found:
  - an auto-sized node FILLED the canvas on iOS (`.frame(minWidth:)` grows
    with the proposal and `.position` proposes the whole canvas), so nodes
    overlapped and swallowed each other's taps and drags, and the measured
    size fed edge anchoring the canvas box. Fixed with `fixedSize` —
    shrink-to-fit with a floor, which is what the web's `min-width` box does.
  - FIXED (F4): every node's accessibility frame was the whole canvas,
    because `.position` gives its child the canvas as layout frame. Two
    changes were both needed: `fixedSize` must come AFTER `.frame`, and the
    node is placed by `.offset` in the top-leading ZStack as the LAST
    modifier — `.offset` does not move layout, so a `contentShape`/gesture
    attached after it still hit-tests the un-offset box and the drag never
    lands. Node frames now read 150x40 and the iOS UITest drags node `a`
    (bisect-verified: offset before the gestures -> label unchanged).
    Device note: Swift renders a position Double as `25.0`, Android `25`.
- [ ] F3/F4 remaining: pixel-level renderer parity (connection line, handles,
  toolbar, resizer, panel, labels, markers, theming, reduced motion), and pan/zoom/connect/reconnect
  gestures on both targets.

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
  among those that cannot render natively.
- [x] F7 second pass: every generated reference page (57 packages) now
  carries a `## Multiplatform` section rendered from the manifest's
  `multiplatform` field — the tier, its rationale, and `nativeFrontend`
  ("what crosses natively") — the same field `check-multiplatform-tier`
  gates and the native compiler derives its web-only warnings from, so the
  reference says what crosses from the one source that decides it.
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
  runs FIRST in each main, so a shared divergence is reported as one.
- [x] F2 shared fixture, second pass: grid snapping, object snap lines,
  `toJSON`/`fromJSON` round-trips, clipboard copy/paste (id remapping and
  edge re-targeting), edge waypoints (append/insert/update/remove + undo),
  `fitView`/`setCenter` against an explicit container size,
  `flowToScreenPosition`, `isNodeVisible`, absolute positions through parent
  chains, child nodes, overlaps, proximity connections, `searchNodes` and
  `resolveCollisions` are oracle-driven on all three targets (19 scenarios).
  The pass found two WEB divergences and fixed them there: a nudge
  (`moveSelectedNodes`) added the raw delta instead of snapping, clamping and
  emitting like `updateNodePosition`; `isNodeVisible` read a child node's
  parent-relative offset.
- [x] F2 layouts: all seven algorithms (`layered` DOWN/RIGHT, `tree`, `force`,
  `stress`, `radial`, `box`, `rectpacking`) are oracle-driven too — the web's
  first-party `layout-engine.ts` (elkjs is long gone) against the native
  ports, unanimated, on one 6-node DAG; the iterative solvers agree to ~1e-4
  px (floating-point order across languages), locked at 0.01 px, the
  deterministic ones exactly. 27 scenarios. Still hand-written only under F2:
  the animated `focusNode` / `animateViewport`.
- [x] The public `@pyreon/flow/webview` component now lowers to the real native
  WebView bridge instead of an unresolved `FlowWebView` symbol. Its generated
  default host is byte-ratcheted against the web builder; graph updates,
  once-only commands, static host styling, selection/event/message/error
  callbacks, renamed imports, and explicit custom HTML are covered by compiler
  and Swift behaviour tests. Android runtime compilation and both device
  behaviour scenarios remain required before F5 can be checked complete.
- [x] F3 direct-native chrome proof now includes a custom node's explicit
  source/target handles, `NodeResizer`, and always-visible `NodeToolbar` from
  the same TSX source. The generated SwiftUI and Compose apps compile for their
  real SDKs, and both device suites assert the toolbar content and accessible
  handle names. Connect/reconnect and resize gestures remain F4 work.
- [x] F4 connect/resize device coverage is wired from the shared counter source
  into both native suites: a handle drag adds an edge and a southeast-resizer
  drag changes the node dimensions. The iOS scenario passes on Simulator; the
  paired Android assertion is gated by the PR device lane. The iOS pass found
  and fixed a real accessibility/input defect: handles, resizers and reconnect
  controls used `.position`, which exposed the whole canvas as every control's
  accessibility frame, while their 12pt hit area was below the native minimum.
  Both native renderers now retain independent finite frames with platform-sized
  hit targets while keeping the same visual size. Pan/zoom, reconnect, selection and keyboard/a11y
  equivalents remain F4 work.
- [x] F4 reconnect coverage now drags the selected seed edge's target endpoint
  onto a third node from the same source app and asserts the changed target in
  both native device suites. The scenario also measures each platform's
  reconnect hit target. Pan/zoom, gesture-driven selection and keyboard/a11y
  equivalents remain F4 work.
- [x] F4 viewport gesture coverage now pans empty canvas space and pinch-zooms
  the direct-native Flow in both device suites, asserting the live viewport
  coordinates and zoom emitted from the shared source app. The iOS device pass
  found that magnification lived only on the background sibling, so a pinch
  beginning over graph content was swallowed; it now runs simultaneously on
  the canvas container. Gesture-driven selection and keyboard/a11y equivalents
  remain F4 work.
- [x] F4 node-selection gestures now tap a rendered node in both native device
  suites and assert the engine's selected-node set changes through a reactive
  label. Edge-pointer selection and keyboard/a11y equivalents remain F4 work.
- [x] F4 hardware-keyboard coverage now focuses a rendered node, sends an arrow
  key and asserts the engine moved it in both native device suites. The suites
  also focus an edge label, select it with Enter, and clear it with Escape;
  native edge labels are active focus stops rather than passive names.
  Edge-pointer selection and the remaining focus/action matrix remain F4 work.
