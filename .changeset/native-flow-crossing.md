---
"@pyreon/native-compiler": minor
"@pyreon/flow": minor
---

`@pyreon/flow` starts crossing to native (iOS + Android) — the state engine
and the edge-drawing runtime.

`const flow = createFlow({ nodes: [...], edges: [...] })` in shared `.tsx`
(v1: literal node/edge config) now compiles to the `@Observable`/`remember`
PyreonFlowState engine — node/edge CRUD, selection, pan/zoom/fitView, and
graph queries (getConnectedEdges/getIncomers/getOutgoers), mutated from
native event handlers with the SAME method names the web `FlowInstance`
uses.

- **The row struct is synthesized from the first node's `data` literal**
  (every node must share one field set, the same uniform-row assumption
  `createTableState` makes about its rows) via the shared
  `synthLiteralStructName` registry — the SAME name every OTHER object
  literal in the file resolves through, so `flow.addNode({...})`'s literal
  argument constructs the real `PyreonFlowNode<Row>`, not a synthesized
  lookalike struct (Swift/Kotlin are both NOMINALLY typed, so a
  structurally-identical-but-differently-named struct does not typecheck).
- Use-sites: `flow.nodes()`/`.edges()`/`.viewport()`/`.zoom()` drop parens
  (property reads, matching the underlying Signal/Computed); `addNode`/
  `addEdge`/`removeNode`/`selectNode`/… flow through as methods with the
  SAME names.
- **`createFlow` owns its data** (unlike `createTableState`, which wraps an
  external reactive source) — nodes/edges seed once from literal config and
  mutate through the instance's own methods, so the Swift emit needs no
  `.onAppear` wiring dance; it is a fully self-contained `@State`
  initializer.
- **`PyreonFlowEdgeCanvas`** (SwiftUI `Canvas` / Compose `Canvas`) draws the
  built-in edge path geometry — bezier / smoothstep / straight / step /
  waypoint all reduce to a closed 4-command vocabulary (`move`/`line`/
  `cubic`/`quad`, the new `EdgeSegment` union in `types.ts`, additive
  alongside the existing SVG `path` string with zero web behavior change) —
  from hand-written native code. It is reusable runtime infrastructure, not
  yet auto-wired from `<Flow>` JSX.
- **The `<Flow>`/`<Background>`/`<Controls>`/`<MiniMap>`/`<Handle>`/
  `<NodeToolbar>`/`<NodeResizer>`/`<Panel>` JSX components, `useFlow`,
  `computeLayout`, and the edge-path helper functions have NO native emit
  yet** — importing them from shared native source now gets a loud,
  per-symbol compiler warning naming `PyreonFlowState`/`PyreonFlowEdgeCanvas`
  (hand-wire natively) or the `@pyreon/flow/webview` bridge (the full
  JSX-driven editor) as the fix, instead of silently emitting a reference to
  a Swift/Kotlin type that does not exist.
- `@pyreon/flow` declares a `nativeFrontend` and leaves the derived
  `WEB_ONLY_PACKAGES` set.

Verified: the real emit type-checks against the real SwiftUI SDK + compiles
and RUNS against the real `@Observable`/`Compose` ports on macOS (bisect-
verified — reverting either the row-struct-registration fix or the
struct-literal call-site rewrite reproduces the exact compile failure this
PR closes), and both targets validate against the compiler stubs. The
co-located native sources pass `check-native-cosource` in isolation (no
implicit dependency on `@pyreon/charts`' runtime, even though both end up in
the same app-level Swift module — an app depending on `@pyreon/flow` alone
must not need `@pyreon/charts` linked).

v1 scope, matching the discipline `createTableState`/`useSortable` set: not
yet ported — `updateNode` (partial merge, no faithful Swift shape without a
builder closure), `isValidConnection`, bulk `selectNodes`, `layout()` (the
separate layout-engine crossing — a follow-up mirroring the charts
engine-bundle-generator tooling), `undo`/`redo`/`pushHistory`,
`copySelected`/`paste`, `moveSelectedNodes`/snap-lines (tied to the native
gesture layer — pan/zoom/drag/connect — the next, most uncertain phase),
sub-flow/group queries.
