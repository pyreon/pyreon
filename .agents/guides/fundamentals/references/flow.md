# @pyreon/flow

## API

- `createFlow<TData>({ nodes, edges })` / `useFlow<TData>()` (auto-disposes). Node/edge CRUD, selection, viewport.
- Components: `<Flow nodeTypes>`, `<Background>`, `<MiniMap>`, `<Controls>`, `<Handle>`, `<Panel>`, `<NodeResizer>`.
- Edge markers: `MarkerType.Arrow`/`ArrowClosed`, per-edge `markerStart`/`markerEnd`. The default is a small filled arrowhead in the line colour (`DEFAULT_MARKER_COLOR` = `var(--pyreon-flow-edge, #999)`), sized in px with `markerUnits="userSpaceOnUse"`.
- `onlyRenderVisibleElements` (default off) virtualizes rendering. `snapToObjects` (default on) precomputes snap candidates once per drag (`_createSnapSession`) and excludes co-dragged nodes.
- Per-edge `pathOptions` (`curvature` → bezier, `borderRadius` + `offset` → smoothstep, `offset` → step). `config.defaultEdgeOptions` merges flow-wide defaults into initial, added and drawn edges; per-edge values (including `markerEnd: null`) win. Type chain: `edge.type` → `defaultEdgeOptions.type` → `defaultEdgeType`.
- Theming is done entirely through `--pyreon-flow-*` CSS variables, all with light fallbacks. Set SVG colours through `style`, never presentation attributes (`var()` is invalid there).
- Dev gates use bare `process.env.NODE_ENV` (reference: `src/layout.ts:warnIgnoredOptions`). Peer dependency: `@pyreon/runtime-dom`.

## Reactivity

- Each node mounts once. Per-node/per-edge thunks subscribe to per-id gates `computed(() => nodeMap().get(id), { equals: Object.is })` (`instance._nodeById`/`_edgeById` in `src/flow.ts`). Every write preserves untouched objects' identity, so a single-node drag re-runs only that node and its touching edges' geometry.
- Selection uses the same per-id gates (`_nodeSelected`/`_edgeSelected`, public `isNodeSelected`/`isEdgeSelected`, bulk `selectNodes`). A rubber-band commit is one Set write.
- Edge geometry is memoized per edge (`_edgeGeometry`; compute fn in `src/edge-geometry.ts`).
- Per-id computeds are cached on the instance, created detached from any scope, swept when their id leaves the map, and disposed in `instance.dispose()`. Locked by `src/tests/drag-fanout.test.tsx`.
- History snapshots are shallow array copies (`structuredClone` throws on function-valued `data`).
- MiniMap, Controls, selection box and helper lines mount once and patch in place. Node measurement shares one ResizeObserver.

## Edge rendering invariants

All three are needed for edges to paint:

1. `.pyreon-flow-viewport` is sized `width/height: 100%`. A 0×0 viewport collapses the edge `<svg>` to zero area, and a zero-area SVG paints nothing even though its paths exist.
2. That viewport is `pointer-events: none`; node wrappers re-enable `auto`, edge paths `stroke`. Otherwise it swallows Controls/MiniMap/pan clicks.
3. A ResizeObserver per node writes rendered size and every `<Handle>` dot centre into `instance.measurements`. One rule, `getEffectiveDimensions` (explicit `width`/`height` → measured → 150×40), feeds every geometry consumer: edge anchors, `layout()`, `fitView`, snap lines, rubber-band hit tests, minimap, `<NodeResizer>`, culling. Public accessor: `flow.getNodeDimensions(id)`. Measurement is client-only.

Edge anchoring per endpoint (`src/edges.ts:resolveHandleAnchor`): explicit `sourceHandle`/`targetHandle` → measured `<Handle>` dot centre → config handle side midpoint → first handle of the type → floating endpoints (`getFloatingEndpoints`/`getNodeIntersection`, where the centre-to-centre line crosses the perimeter). An unknown handle id anchors at the first handle and dev-warns once.

## Interaction

- The container pan `pointerdown` bails on `.pyreon-flow-controls`, `-minimap`, `-panel`, `.nodrag`, `button`, inputs and links. Otherwise `setPointerCapture` swallows the button's click.
- The package's browser tests run through the real `@pyreon/vite-plugin` compiler (`vitest.browser.config.ts` adds `pyreon()`), so they exercise the shipped `_tpl()` path. Other packages' browser suites may not.

## Native

- `createFlow` state crosses to native as `PyreonFlowState` (state only; gestures, layout and chrome do not).
- `@pyreon/flow/webview`: `<FlowWebView>` lowers to `PyreonWebView` on SwiftUI and Compose with a generated dependency-free host, live graph/command JSON, and parsed selection/event/message/error callbacks. The generated host is freshness-gated against `buildFlowHostHtml()`; the handled prop set is `HANDLED_FLOW_WEBVIEW_PROPS` in `packages/native/compiler/src/flow-lowering.ts`, ratcheted against the public prop interface. Host styling must be statically resolvable; dynamic values warn by name.
