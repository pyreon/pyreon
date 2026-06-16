# @pyreon/flow

Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout.

Build node/edge diagrams (workflow editors, mind maps, BPMN, story graphs, infra topology) with Pyreon's fine-grained reactivity. Each node and edge has its own per-property signal — a 60fps drag in a 1000-node graph is O(1) per frame, not O(N). Custom node and edge renderers receive REACTIVE ACCESSORS (`data()` / `selected()` / `dragging()` / source/target coordinates), so a custom node mounts EXACTLY ONCE across the lifetime of the graph and patches in place on every change. Pan/zoom via pointer events + CSS transforms (no D3). Auto-layout via elkjs, lazy-loaded on first use.

## Install

```bash
bun add @pyreon/flow @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
# elkjs is bundled as a runtime dependency, lazy-loaded
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
| Reactive state | `nodes` / `edges` / `viewport` / `selection` (signals) |
| Node CRUD | `addNode` / `removeNode` / `updateNode` / `updateNodePosition` / `setNodes` |
| Edge CRUD | `addEdge` / `removeEdge` / `setEdges` |
| Edge waypoints | `addEdgeWaypoint` / `removeEdgeWaypoint` |
| Selection | `selectNode(id, additive?)` / `selectEdge(id, additive?)` / `clearSelection` / `deleteSelected` |
| Clipboard | `copySelected` / `paste(offset?)` |
| Viewport | `zoomIn` / `zoomOut` / `zoomTo` / `panTo` / `fitView(ids?, padding?)` |
| Auto-layout | `layout(algorithm?, options?)` — Promise, elkjs lazy-loaded |
| Graph queries | `getConnectedEdges` / `getIncomers` / `getOutgoers` / `isValidConnection` |
| Listeners | `onConnect` / `onNodesChange` / `onNodeClick` / `onEdgeClick` |
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

JSX components are **NOT generic at the call site** (`<Flow<MyData> />` isn't valid JSX). `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers pass `FlowInstance<MyData>` without casting.

## Custom node renderers

`NodeComponentProps<TData>` exposes accessors — NOT plain values:

```tsx
type MyData = { label: string; status: 'pending' | 'done' }

const MyNode: ComponentFn<NodeComponentProps<MyData>> = (props) => (
  <div class={() => (props.selected() ? 'selected' : '')}>
    {() => props.data().label}
    {() => props.dragging() && <span>(dragging)</span>}
  </div>
)

const flow = useFlow<MyData>({ nodes: [...], edges: [...] })

<Flow instance={flow} nodeTypes={{ task: MyNode }} />
// Use type="task" on nodes to render via MyNode
```

Each node mounts ONCE per graph lifetime. Drags, selection clicks, and `updateNode(id, { data: ... })` patches read through the same reactive accessors — no remount, no diff.

## Custom edge renderers

Same accessor contract — `EdgeComponentProps` exposes `sourceX()` / `sourceY()` / `targetX()` / `targetY()` / `selected()` as reactive accessors. Use the path helpers (`getBezierPath`, `getSmoothStepPath`, `getStraightPath`, `getStepPath`, `getWaypointPath`) inside the render to compute `d`.

## Auto-layout via elkjs

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

## Edge path helpers

For custom edge renderers — pure functions returning SVG `d`-string + label coordinates:

- `getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })`
- `getSmoothStepPath(...)`
- `getStraightPath(...)`
- `getStepPath(...)`
- `getWaypointPath(...)` — with mid-edge waypoints

Plus `getEdgePath`, `getHandlePosition`, `getSmartHandlePositions` for handle math.

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
- **elkjs is lazy-loaded on first `flow.layout()` call** — the first layout takes longer than subsequent ones.
- **`flow.dispose()` is final** — listeners detach, signals stop updating. Don't reuse a disposed instance. `useFlow` wires this up for you on unmount.

## Documentation

Full docs: [pyreon.dev/docs/flow](https://pyreon.dev/docs/flow) (or `docs/src/content/docs/flow.md` in this repo).

## License

MIT
