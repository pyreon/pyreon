# @pyreon/flow

Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout.

Build node/edge diagrams (workflow editors, mind maps, BPMN, story graphs, infra topology) with Pyreon's fine-grained reactivity. Each node and edge has its own per-property signal — a 60fps drag in a 1000-node graph is O(1) per frame, not O(N). Custom node and edge renderers receive REACTIVE ACCESSORS (`data()` / `selected()` / `dragging()` / source/target coordinates), so a custom node mounts EXACTLY ONCE across the lifetime of the graph and patches in place on every change. Pan/zoom via pointer events + CSS transforms (no D3). Auto-layout through a built-in seven-mode engine — pure geometry, zero dependencies, code-split so it loads on the first `layout()`.

## Install

```bash
bun add @pyreon/flow @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
# no layout dependency — the seven-mode engine is built in and code-split
```

`@pyreon/runtime-dom` is a peer because the JSX templates emit `_tpl()` calls — declare it in your app's deps.

## Quick start

```tsx
import { createFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'

const flow = createFlow({
  nodes: [
    { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
    { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
  ],
  edges: [{ source: '1', target: '2' }],
})

const App = () => (
  <Flow instance={flow}>
    <Background />
    <MiniMap />
    <Controls />
  </Flow>
)
```

## `createFlow<TData>(config)` vs `useFlow<TData>(config)`

- **`createFlow`** — bare constructor. Use for flows owned outside the component tree (app stores, singletons that outlive any view).
- **`useFlow`** — component-scoped wrapper. Auto-disposes on unmount. Prefer this inside component bodies.

```tsx
const Diagram = () => {
  const flow = useFlow<{ label: string }>({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [],
  })
  return (
    <Flow instance={flow}>
      <Background />
    </Flow>
  )
}
```

The `TData` generic flows through to `FlowNode<TData>` and `NodeComponentProps<TData>` so custom node renderers stay typed end-to-end.

## Instance API

`FlowInstance<TData>`:

| Surface | Methods |
|---|---|
| Reactive state | `nodes` / `edges` / `viewport` / `measurements` (signals), `selectedNodes` / `selectedEdges` / `nodeMap` / `edgeMap` (computeds) |
| Node CRUD | `addNode` / `removeNode` / `updateNode` / `updateNodePosition` |
| Edge CRUD | `addEdge` / `removeEdge` / `reconnectEdge` |
| Edge waypoints | `addEdgeWaypoint` / `updateEdgeWaypoint` / `removeEdgeWaypoint` |
| Selection | `selectNode(id, additive?)` / `selectEdge(id, additive?)` / `clearSelection` / `selectAll` / `deleteSelected` |
| Clipboard / history | `copySelected` / `paste(offset?)` / `pushHistory` / `undo` / `redo` |
| Viewport | `zoomIn` / `zoomOut` / `zoomTo` / `panTo` / `focusNode` / `animateViewport` / `fitView(ids?, padding?)` |
| Geometry | `getNodeDimensions(id)` — effective box: explicit → measured → 150×40 default |
| Auto-layout | `layout(algorithm?, options?)` — Promise, built-in seven-mode engine (code-split), fed measured node sizes |
| Graph queries | `getConnectedEdges` / `getIncomers` / `getOutgoers` / `isValidConnection` / `findNodes` / `searchNodes` |
| Intersections | `getIntersectingNodes(nodeOrRect, partially?)` / `isNodeIntersecting(nodeOrRect, area, partially?)` / `getNodesBounds(ids?)` |
| Listeners | `onConnect` / `onNodesChange` / `onNodeClick` / `onEdgeClick` / `onNodeDragStart` / `onNodeDragEnd` / `onNodeDoubleClick` / `onNodeContextMenu` / `onEdgeContextMenu` / `onPaneContextMenu` / `onNodeMouseEnter` / `onNodeMouseLeave` / `onEdgeMouseEnter` / `onEdgeMouseLeave` |
| Serialization | `toJSON()` / `fromJSON(data)` |
| Lifecycle | `dispose()` |

## Components

| Component | Notes |
|---|---|
| `<Flow instance={flow} nodeTypes={...} edgeTypes={...}>` | Main container — pan/zoom, mounts nodes/edges |
| `<Background variant?="dots" \| "lines">` | Grid background |
| `<MiniMap>` | Overview minimap with viewport indicator |
| `<Controls>` | Zoom in/out + fit-view buttons |
| `<Handle type="source" \| "target" position={Position.Top}>` | Connection handle on nodes |
| `<Panel position="top-left" \| ...>` | Overlay panel relative to the flow viewport |
| `<NodeResizer>` | Resize handles for the selected node |
| `<NodeToolbar>` | Toolbar attached to a node |
| `<EdgeLabelRenderer>` | HTML labels for custom edges |
| `<BaseEdge path label? labelX? labelY?>` / `<EdgeText x y label>` | Building blocks for custom edges: the stroke and an SVG label |
| `<ViewportPortal>` | HTML in flow coordinates (web only) |

JSX components are **NOT generic at the call site** (`<Flow<MyData> />` isn't valid JSX). `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers pass `FlowInstance<MyData>` without casting.

## Custom node renderers

`NodeComponentProps<TData>` exposes accessors — NOT plain values:

```tsx
type MyData = { label: string; status: 'pending' | 'done' }

const MyNode: ComponentFn<NodeComponentProps<MyData>> = (props) => (
  <div class={props.selected() ? 'selected' : ''}>
    {props.data().label}
    {() => props.dragging() && <span>(dragging)</span>}
  </div>
)

const flow = useFlow<MyData>({ nodes: [...], edges: [...] })

<Flow instance={flow} nodeTypes={{ task: MyNode }} />
// Use type="task" on nodes to render via MyNode
```

Each node mounts ONCE per graph lifetime. Drags, selection clicks, and `updateNode(id, { data: ... })` patches read through the same reactive accessors — no remount, no diff.

## Custom edge renderers

Same accessor contract — `EdgeComponentProps` exposes `sourceX()` / `sourceY()` / `targetX()` / `targetY()` / `selected()` as reactive accessors. Use the path helpers (`getBezierPath`, `getSmoothStepPath`, `getStraightPath`, `getStepPath`, `getWaypointPath`) inside the render to compute `d`, and draw it with `<BaseEdge path={...}>` or a plain `<path>`.

Nodes and edges take `zIndex`; a selected node is raised above its neighbours (`elevateNodesOnSelect`, on by default) and `elevateEdgesOnSelect` does the same for edges. `connectionMode: 'loose'` allows any handle to connect to any other, and the canvas auto-pans while a node or connection is dragged near its edge (`autoPanOnNodeDrag`, `autoPanOnConnect`, `autoPanSpeed`).

## Auto-layout

```ts
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })
```

Available algorithms: `layered` (default), `force`, `stress`, `tree`, `radial`, `box`, `rectpacking`.

**`LayoutOptions` applicability**:

| Option | Applies to |
|---|---|
| `nodeSpacing` | Every algorithm |
| `direction` | `layered`, `tree` |
| `layerSpacing` | `layered` only |
| `edgeRouting` | `layered` only |

Other algorithms accept the option in the type (it typechecks) but silently ignore it at layout time. The framework emits a `console.warn` in dev mode when an option is set on an algorithm that ignores it.

## Serialization

```ts
const snapshot = flow.toJSON() // { nodes, edges, viewport }
localStorage.setItem('flow', JSON.stringify(snapshot))

// Later:
flow.fromJSON(JSON.parse(localStorage.getItem('flow')!))
```

`toJSON()` returns one-level copies (node `data` is shared by reference, so function-valued data never throws). `fromJSON()` treats its input as untrusted: duplicate node / edge ids keep the first, edges referencing a missing node are dropped, and a node without a valid `position` is placed at `{ x: 0, y: 0 }` — each with a `[Pyreon]` dev warning.

## Events and history notes

- `onConnect` fires only for a USER connection (a handle drag dropped on a valid handle). Programmatic `addEdge` / `addEdges` / `paste` / `fromJSON` report through `onEdgesChange` (`type: 'add'`).
- Removing a sub-flow parent (`removeNode(s)`, `deleteSelected`, the Delete key) removes its descendants and their edges; `paste` re-parents copied children onto the copied parent.
- `historyLimit` (default `50`) bounds the undo stack. Redo is Cmd/Ctrl+Shift+Z or Ctrl+Y.

## Edge path helpers

For custom edge renderers — pure functions returning SVG `d`-string + label coordinates:

- `getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })`
- `getSmoothStepPath(...)`
- `getStraightPath(...)`
- `getStepPath(...)`
- `getWaypointPath(...)` — with mid-edge waypoints

Plus `getEdgePath` (type dispatcher, threads per-edge `pathOptions`), `getHandlePosition`, `getSmartHandlePositions`, `getFloatingEndpoints` / `getNodeIntersection` (natural-angle perimeter anchoring), `resolveHandleAnchor` (handle-anchor priority chain), and `getEffectiveDimensions` (explicit → measured → default node box).

## Edge anchoring & measured dimensions

Where an edge attaches is resolved per endpoint: a **measured `<Handle>` dot** named by `edge.sourceHandle` / `targetHandle` (the renderer records every dot's real rendered center) → a **config handle**'s side midpoint → **floating endpoints** for handle-less nodes (the edge meets the node where the center-to-center line crosses its perimeter — natural-angle arrows). Unknown handle ids anchor at the first handle and dev-warn once.

Nodes need no explicit `width`/`height` — the renderer measures the real rendered box, and the effective size (explicit → measured → `150×40` default) drives edges, `layout()`, `fitView`, drag snap lines, rubber-band selection, the minimap, and viewport culling. Read it via `flow.getNodeDimensions(id)` or reactively via `flow.measurements()`.

## Edge modes

`type: 'bezier' | 'smoothstep' | 'step' | 'straight'` per edge (or any custom name registered via `edgeTypes`), plus `waypoints` for explicit bend-point routes. Tune the built-ins per edge with `pathOptions` (`curvature` for bezier, `borderRadius`/`offset` for smoothstep, `offset` for step), and set flow-wide defaults — `type`, `animated`, markers, `pathOptions`, … — via `config.defaultEdgeOptions` (per-edge values always win).

## Theming

Every renderer color goes through a `--pyreon-flow-*` CSS custom property (25 variables — nodes, edges, handles, controls, minimap, toolbar, resizer) with the light-mode value as fallback. Set them on the flow container to re-skin everything; see the [Theming docs](https://pyreon.dev/docs/flow#theming) for the full table.

## Position enum

```ts
import { Position } from '@pyreon/flow'

Position.Top // 'top'
Position.Right // 'right'
Position.Bottom // 'bottom'
Position.Left // 'left'
```

## Gotchas

- **`@pyreon/runtime-dom` is a required peer** — JSX templates emit `_tpl()` calls.
- **Custom node / edge renderers must read props as accessors** (`props.data()`, not `props.data`). Reading the bare property captures a snapshot and your node won't react to `updateNode` writes.
- **JSX components aren't generic at the call site** — write `useFlow<MyData>(...)` then pass the instance to `<Flow instance={flow}>`. `<Flow<MyData> />` is a TypeScript syntax error.
- **`LayoutOptions.direction` / `layerSpacing` / `edgeRouting` apply to layered/tree only** — silently ignored by `force` / `stress` / `radial` / `box` / `rectpacking`. Dev mode logs a warning.
- **The layout engine is code-split** — the first `flow.layout()` call fetches its chunk, so it takes longer than subsequent ones; every mode is pure geometry with no external dependency.
- **`flow.dispose()` is final** — listeners detach, signals stop updating. Don't reuse a disposed instance. `useFlow` wires this up for you on unmount.

## Multiplatform

On iOS and Android the native compiler lowers `createFlow` / `useFlow` and `<Flow>` to `PyreonFlowState` plus an interactive SwiftUI or Compose host. This is a native view tree, not a WebView.

The same source provides all of these on web, iOS and Android:

- Node and edge CRUD, selection, history and all seven layouts.
- The web's default node look, built-in and static custom node and edge renderers, and custom connection lines.
- `<path d=…>` inside custom edges and connection lines, for any SVG path data.
- Inline `<svg>` inside node, edge and connection-line renderers: its shapes (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, nested `<g>`) draw natively, scaled by the `viewBox`, with SVG paint inheritance. `<text>`, gradients and `transform` are named in a warning.
- Plain `<div>` / `<p>` / `<span>` in a renderer, in the two shapes whose native layout provably matches the browser's: text-only content, and a `<div>` of block children. A `class`, a `style` or inline-flow children keep the warning that points at `<FlowWebView>`.
- Handles, connect and reconnect gestures (both `connectionMode`s), resizing, and toolbars.
- `zIndex` and select elevation, auto-pan, the intersection helpers, and `<BaseEdge>` / `<EdgeText>`.
- The context-menu listeners (long-press) and the hover listeners (pointer hover).
- `<Background>`, `<Controls>`, `<MiniMap>` and `<Panel>`, plus `colorMode` including `'system'`.
- Pan, pinch-zoom and drag.
- Keyboard commands and accessibility names.
- Culling with `onlyRenderVisibleElements`.

**How it is verified:**

- The native engines replay shared scenarios whose expected answers come from the web engine. Two checks fail when a portable method or a native config field has neither a scenario nor a stated exemption.
- Both real toolchains compile the emitted code.
- A test ties every native palette colour to the web's `--pyreon-flow-*` value, in light and dark.
- The example apps' iOS and Android device suites assert what the renderer draws, the gestures, the keyboard commands and a 400-node scale scenario.

The full list, including the platform limits, is in the [docs](https://pyreon.dev/docs/flow#ios-and-android).

**What stays browser-only.** The compiler reports each of these by name:

- `FlowLayersContext` and `flowStyles`, the DOM renderer's layer context and CSS custom properties.
- `<ViewportPortal>` (HTML positioned with CSS).
- Renderers whose layout depends on CSS: DOM elements with a `class` or `style`, inline-flow mixes of text and elements, and SVG `<text>`, gradients and `transform`. Plain SVG shapes and simple `<div>` / `<p>` / `<span>` structure are not in this list; they render natively.
- Renderer maps computed at runtime.

Keep that presentation in `NativeIOS` / `NativeAndroid` branches, or use the WebView route below. These inline styles lower directly:

- Node styles: `width`, `height`, `padding`, hex `background`/`background-color`, hex `border-color`, `border-width`, `border-radius` and `opacity`.
- Edge styles: `stroke` and `stroke-width`.

**`@pyreon/flow/webview`** hosts the unchanged browser renderer when an app needs it. `<FlowWebView>` is the same JSX on every target. It lowers to the native `PyreonWebView` bridge, which provides:

- A generated default host.
- Reactive graph updates and a reactive `html` swap.
- Once-only commands.
- Selection, event, message and error callbacks.

```tsx
import { FlowWebView } from '@pyreon/flow/webview'

<FlowWebView graph={{ nodes: nodes(), edges: edges() }} onSelect={(e) => selected.set(e.id)} />
```

It is still a WebView, with a JSON bridge. The diagram is opaque to native gestures and to the platform accessibility tree, so prefer the native host unless the browser renderer itself is the requirement. Without an explicit height it defaults to 150pt (iOS) or 150dp (Android). `buildFlowHostHtml()` returns the self-contained host page, for hosting it in a plain `<WebView>` yourself.

See `examples/native-tasks` (native `<Flow>` and `<FlowWebView>` side by side) and `examples/native-viz` for one-source multiplatform apps.

## Documentation

Full docs: [pyreon.dev/docs/flow](https://pyreon.dev/docs/flow) (or `docs/src/content/docs/flow.md` in this repo).

## License

MIT
