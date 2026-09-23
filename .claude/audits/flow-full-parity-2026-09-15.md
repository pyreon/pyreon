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
- [x] **F2 — direct state/algorithm parity.** Prove every portable method and
  mutable config field against shared fixtures: CRUD, selection, viewport,
  snapping, connection validation, history, serialization, layout and graph
  queries.
- [x] **F3 — renderer/chrome parity.** Close static node/edge renderer,
  connection-line, handle, toolbar, resizer, minimap, controls, panel, label,
  marker, theming and animation differences.
- [x] **F4 — interaction and accessibility parity.** Device-test pointer/touch,
  pan/zoom, connect/reconnect, selection, keyboard equivalents, focus,
  accessibility names/roles and reduced motion on both targets.
- [x] **F5 — dynamic/browser-rich contract.** Make arbitrary renderer maps,
  arbitrary SVG paths and DOM/CSS custom renderers select the supported
  `@pyreon/flow/webview` path without semantic loss. Device-test messages,
  graph updates, selection callbacks, reload/reconnect and failure states.
- [x] **F6 — real-app and scale proof.** Exercise large graphs, custom nodes and
  mixed gestures in web Chromium, iOS Simulator and Android Emulator; add
  deterministic performance and memory ceilings without claiming benchmark
  numbers until measured.
- [x] **F7 — documentation/manifest truth.** Update the manifest, package docs,
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
- [x] F2 sweep, closing pass: the fixture gained the remaining portable
  methods (bulk add/set/remove for nodes and edges, `updateNode`,
  `updateNodeData`, measurement set/clear, `batch`) and a config vocabulary it
  translates per target: zoom limits, `multiSelect`, deletability, `autoHistory`,
  `connectionRules` (typed nodes), `defaultEdgeType`, `defaultEdgeOptions`,
  `nodeExtent`, `fitViewPadding` and a user `isValidConnection`. 46 scenarios.
  Two machine gates in `native/compiler/src/tests/flow-parity-coverage.test.ts`
  now fail closed: every lowered method must be called in the oracle region or
  be HAND_ASSERTED (callbacks, animation, `dispose`) and called in both
  fixtures; every native constructor field (read from the Kotlin constructor)
  must be set by a scenario on BOTH targets or classified, and a field
  classified as gesture/renderer-only fails the moment `createFlow` starts
  reading it. The sweep found one real divergence: web `multiSelect: false`
  only gated the drag-select box, so an additive `selectNode(s)`/`selectEdge`
  still multi-selected while both native engines replaced. Fixed on web.
  Known, deliberate limit: native fixtures set config as properties after
  construction, so an INITIAL edge is normalized with that moment's defaults;
  the edge-default scenarios therefore only query edges added afterwards.
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
- [x] F5 device proof, first pass: `examples/native-tasks` hosts a real
  `<FlowWebView>` (`@pyreon/flow/webview`) and BOTH device lanes assert the
  bridge in both directions without asserting inside the WebView: the graph
  and a `fit-view` command are pushed into the WKWebView / Android WebView,
  the hosted renderer fits and posts `viewport-change` back over the reverse
  channel into native Text (`gal-flow-webview-event`), and a button pushes a
  NEW command id so the event count moving 1→2 — not 3 — proves the reactive
  command push AND once-only execution of `initial-fit`. Android runtime
  compilation is proven by the same lane (`flow/native/kotlin` is a Gradle
  `srcDir` of the tasks app). Two compiler bugs fell out of writing the first
  real consumer, both silent and both on both targets:
  - a BLOCK-bodied handler (`onEvent={(e) => { a.set(…); b.set(…) }}`) on any
    WebView-family host lowered to an EMPTY closure — the statements live in
    the arrow's `stmts`, and the message-handler emitter read only `body`.
    Same for `<WebView onMessage>` / `<ChartWebView onEvent>`. Fixed by
    routing through the generic action emitter `onPress` already uses.
  - `data-testid` never reached any WebView-family host (no generic layout
    tail), so none was selectable by XCUITest / `onNodeWithTag` — the
    `<Link>`/`<Toggle>` class again. The tail now runs on every host, skipping
    the props the host lowers itself (`background` is the hosted PAGE's, not
    a view token).
  Still open under F5: a node-tap `onSelect` and a host FAILURE state on
  device (both need a gesture/fault INSIDE the WebView that neither test
  harness can drive reliably), and `reload`/reconnect.
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
  key and asserts the engine moved it in both native device suites. The same
  suites tap an accessible edge label and assert pointer selection. Edge
  hardware focus and the remaining focus/action matrix remain F4 work.
- [x] F3 renderer/chrome parity is device-proven on both targets from the same
  counter source, and every check reads what the RENDERER painted or placed
  rather than engine state: `<Panel position="bottom-right">` sits in the
  canvas's bottom-right quadrant (frame relation); the seed edge's
  `markerEnd: { type: 'arrowclosed', color: '#ff0000' }` paints exact red
  pixels in a canvas screenshot; a reactive `colorMode` paints the web's dark
  canvas colour `#0b1220` only while dark (zero → many → zero pixels across
  two toggles); `connectionLine={NativeConnectionLine}` mounts only while a
  source handle is dragged (iOS: a main-queue timer fires inside the
  synchronous gesture and finds it in the accessibility tree, plus a store the
  component writes from `onMount`, 0 → 1 → 2; Android: the split-gesture
  mid-drag existence check plus the same store); and `config.reducedMotion`
  lands a 3s viewport animation instantly while the same call animates once
  the flag is cleared through `config` (iOS reads a mid-flight value; Android
  measures elapsed time, because a semantics read waits for composition idle
  and a running animation timer keeps it busy). Renderer defects the pass
  found and fixed: neither native renderer painted a colour mode at all and
  SwiftUI's `.preferredColorScheme` re-themed the whole window — both now
  resolve a `PyreonFlowPalette` (the web's `--pyreon-flow-*` values, light
  and dark) scoped to the flow and its Panel overlays; the Compose canvas
  wrapped to its Controls column instead of filling its box; Compose anchored
  edge labels top-left (web/Swift centre them) and its `clickable` inflated
  the label's hit box over the target-end marker and neighbouring node taps.
  Compiler defects found on the way: `<Background>`/`<MiniMap>` baked
  light-only default colours; a single-statement block handler holding an
  assignment emitted an empty closure; a kebab-case `defineStore` id emitted
  an unparsable class name; a zero-parameter listener subscriber emitted a
  Swift closure of the wrong arity. The Android px-vs-dp graph-unit divergence
  is FIXED on the gesture branch (#3536) and merged up the stack: Compose graph
  units were device pixels, so a 150-unit node was ~57dp on a 420dpi phone and
  its 48dp resizer targets covered it — the stack's own Android lane failed
  the node tap, the connect drag and the pinch on CI for that reason. Still
  open under F3: pixel parity of node chrome under `colorMode="system"` (only
  forced modes are asserted).

## F4 checkpoint — the keyboard focus/action matrix (2026-09-22)

- [x] **Edge hardware focus.** Native edge labels were reachable by VoiceOver and
  TalkBack only. On Android they had no focus action at all, and on iOS a
  `.focusable` view is not focused by a tap on its own. Both renderers now make
  the label focusable, and route its keys through `handleKeyboardCommand`,
  which gains an `edgeId`. Enter or Space selects the focused edge, like the
  web's edge `onKeyDown`. Bisect: without the change, Android fails with
  `the node is missing [RequestFocus]` and iOS with "Space on the focused edge
  label did not select the edge".
- [x] **The matrix, driven on devices** (`native-counter` suites):
  | Focused | Key | Result | Android | iOS |
  | --- | --- | --- | --- | --- |
  | node | Arrow | moves the node | asserted | asserted |
  | node | Escape | clears the selection | asserted | not deliverable |
  | node | Enter | selects the node | asserted | not deliverable |
  | node | Space | selects the node | covered by Enter | asserted |
  | edge | Enter | selects the edge | asserted | not deliverable |
  | edge | Space | selects the edge | covered by Enter | asserted |
  | canvas | Ctrl/Cmd+A | selects every node | asserted | asserted |
  | canvas | Delete | removes the selection and its edges | asserted | not deliverable |
  | canvas | Ctrl/Cmd+Z | undoes the last change | asserted (restores the deletion) | asserted (undoes the arrow move) |
- **iOS test-harness limit, measured rather than assumed.** XCUITest cannot
  deliver Return or Escape to the app on the simulator. A logging probe saw
  Right Arrow and Space reach both the node and the canvas, and never those two
  keys, whether sent to the element or the application, and whether handled by
  `onKeyPress` or a `.keyboardShortcut`. Backspace and forward-delete do not
  reliably arrive either. The iOS rows therefore drive Space and Cmd+Z, the
  web's other activation key, and the Android suite owns Enter and Escape.
  Nothing was shipped for Return/Escape on iOS, because it could not be verified.
## F6 checkpoint — scale and memory ceilings (2026-09-22)

- [x] **Scale on all three targets.** `examples/native-tasks` has a `/flow-scale`
  screen that loads a 20×20 grid (400 nodes) into a culling flow. The iOS lane,
  the Android lane and the Chromium e2e (`native-tasks-web`) each assert the
  same COUNTS, never timings:
  - at most 40 of the 400 nodes are mounted at the origin viewport, and at least 2;
  - panning makes node 170 mount and node 0 unmount, and the bound still holds;
  - a node that scrolled in can be dragged, and the move reaches the engine
    (device lanes);
  - a pinch zooms the engine and the mounted set stays under 200 (device lanes).
- [x] **Memory ceilings, GC-observable** (`flow/src/tests/scale-memory.test.ts`):
  a mounted 1,000-node canvas releases every node after unmount plus dispose,
  and 500 nodes removed from a live, mounted flow are released. Writing these
  found three real retentions, each bisect-verified:
  - `@pyreon/reactivity`'s dev devtools registry kept an unformatted `Error`
    per node on a strongly held record. Its call-site frames reached the
    node's creator, so an unmounted component was never collected.
  - The same capture kept 10 frames, pinning a reconciler frame above the call
    site. That frame closed over the node array, so removed nodes stayed alive.
  - `instance.config` kept the initial `nodes`/`edges` arrays for the
    instance's lifetime.
- [x] Two compiler bugs surfaced by the first consumer to write the shapes:
  an inline-object `createFlow<{ … }>` generic lowered to `String`/`Any`, and
  an integer coordinate expression reached the Double position unconverted.
- Existing complexity locks still cover the per-frame cost: `drag-frame-complexity`,
  `drag-fanout`, `selection-fanout`, `pointer-hot-path`, `measurement-write-cost`.
- [x] **Custom renderers at scale.** The grid renders through a custom node
  type with its own handles, and all three targets assert one target handle per
  mounted node, so a user renderer and its handles are culled with the node.
- Keyboard interaction is tracked under F4, where the focus/action matrix lives.
- [x] F5 device proof, second pass: both device lanes now tap INSIDE the
  hosted flow and assert the tap reached native `onSelect`, swap the graph and
  assert the same tap selects the NEW middle node (an in-place re-render, the
  graph-update half of reload), and host a graph the renderer cannot draw and
  assert `onError` fires through the host-error bridge. The fixture graphs are
  one symmetric row, so fit-view centres the middle node and a centre tap is
  deterministic without asserting inside the WebView. Writing the tap found a
  real host bug on both targets: an UNSIZED `<WebView>` had no height. On
  Android the View gets WRAP_CONTENT params, so a `height: 100%` page measured
  `clientHeight = 0` (read over WebView DevTools) and fitted the graph into
  nothing; on iOS it got no ideal height inside a ScrollView. Both hosts now
  default to the 150pt/dp the web `<iframe>` falls back to, and an explicit
  height still wins. Bisect: reverting only the Android `MATCH_PARENT` fails
  the node-tap assertion. Still open under F5 at this point: a full page
  RELOAD (new `html`) and arbitrary renderer maps / SVG paths selecting the
  WebView path. Both closed in the third pass below.
- [x] F5 device proof, third pass:
  - **Reload/reconnect.** A tasks-gallery `FlowWebView` swaps its `html`
    between two small hosts. Each reports `<host>:<node count>` through
    `onSelect`, so `a:3` then `b:3` proves the page reloaded, received the
    graph again, and answered over a fresh reverse bridge. Both device lanes
    assert it. On web the swap did nothing: the web `<WebView>` and all four
    wrappers (flow, charts, code, rich-text) read `html` once at setup. They
    now forward it reactively; real-Chromium specs in primitives and flow lock
    it, each bisect-verified.
  - **Renderer routing.** A `<Flow>` custom node built from DOM (`<div
    style=…>`) was emitted as `div(…)`, which exists on neither platform, with
    no warning; the same held for any raw element anywhere. Both emitters now
    warn by name and point at `<FlowWebView>` from `@pyreon/flow/webview`, and
    the arbitrary-SVG-path warning names the same route. No example emits the
    new warning, so nothing that lowered is affected.
## F4 checkpoint — the keyboard focus/action matrix (2026-09-22)

- [x] **Edge hardware focus.** Native edge labels were reachable by VoiceOver and
  TalkBack only. On Android they had no focus action at all, and on iOS a
  `.focusable` view is not focused by a tap on its own. Both renderers now make
  the label focusable, and route its keys through `handleKeyboardCommand`,
  which gains an `edgeId`. Enter or Space selects the focused edge, like the
  web's edge `onKeyDown`. Bisect: without the change, Android fails with
  `the node is missing [RequestFocus]` and iOS with "Space on the focused edge
  label did not select the edge".
- [x] **The matrix, driven on devices** (`native-counter` suites):
  | Focused | Key | Result | Android | iOS |
  | --- | --- | --- | --- | --- |
  | node | Arrow | moves the node | asserted | asserted |
  | node | Escape | clears the selection | asserted | not deliverable |
  | node | Enter | selects the node | asserted | not deliverable |
  | node | Space | selects the node | covered by Enter | asserted |
  | edge | Enter | selects the edge | asserted | not deliverable |
  | edge | Space | selects the edge | covered by Enter | asserted |
  | canvas | Ctrl/Cmd+A | selects every node | asserted | asserted |
  | canvas | Delete | removes the selection and its edges | asserted | not deliverable |
  | canvas | Ctrl/Cmd+Z | undoes the last change | asserted (restores the deletion) | asserted (undoes the arrow move) |
- **iOS test-harness limit, measured rather than assumed.** XCUITest cannot
  deliver Return or Escape to the app on the simulator. A logging probe saw
  Right Arrow and Space reach both the node and the canvas, and never those two
  keys, whether sent to the element or the application, and whether handled by
  `onKeyPress` or a `.keyboardShortcut`. Backspace and forward-delete do not
  reliably arrive either. The iOS rows therefore drive Space and Cmd+Z, the
  web's other activation key, and the Android suite owns Enter and Escape.
  Nothing was shipped for Return/Escape on iOS, because it could not be verified.
- [x] F3 closed: `colorMode="system"` is device-proven. The counter source cycles
  a third mode, and both suites switch the DEVICE appearance (not the app) and
  count the web's dark canvas colour #0b1220: zero on a light device, over 1000
  after the device goes dark, zero again after it returns to light. Android
  switches with `UiModeManager.setApplicationNightMode`, which takes a uiMode
  configuration change. That only works because the activity now declares
  `android:configChanges` (#3577); without it the switch recreated the activity
  and reset the app. iOS uses `XCUIDevice.shared.appearance`. Bisect: making the
  `"system"` branch of the palette resolve to light fails both targets with
  "did not follow the device into dark". On Kotlin that means BOTH `resolve()`
  and `isDark()`, since the canvas reads the resolved palette. Honest limit: the
  iPhone 16-family simulator CI resolves never passes an appearance flip to the
  app (the same finding as `test_colorSchemeTracksSimulatorAppearance`). There
  the dark half is gated on `useColorScheme`'s own "Theme: dark" probe and logs
  a NOTE instead of asserting. It runs in full on an iPhone 17 Pro (verified),
  and the Android half always runs.
- [x] F7 documentation/manifest truth, written against the union of the
  F2–F6 PRs rather than main alone:
  - Manifest: `@pyreon/flow` moves from `web-only` + `nativeFrontend` to
    `service-backend`. The default surface is one API with a web engine and a
    Swift/Kotlin port; the browser-only remainder is two named exports plus DOM
    renderers, all warned by name. Tier table regenerated.
  - `docs/flow.md`: a new "iOS and Android" section covering what renders
    natively, what does not cross and the WebView route, how it is verified,
    and the platform limits. Those limits are: iOS keys XCUITest cannot send,
    iPhone 16-family appearance propagation, and process death on Android.
  - README: the Multiplatform section rewritten. It said gestures, keyboard and
    reduced motion were not device-asserted, repeated its own paragraph, and
    contradicted itself about how native hosts `FlowWebView`.
  - `check-native-coverage`: the flow rationale cites the device evidence;
    `@pyreon/flow/webview` is no longer described as "NOT device-proven".
  - Found while integrating: the F2 config gate matched comments, so a comment
    naming `nodesDraggable` read as an engine read. It now strips comments
    first (#3576).

