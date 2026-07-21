---
title: Flow
description: Reactive flow diagrams for Pyreon — signal-native nodes, edges, pan/zoom, auto-layout via elkjs.
---

`@pyreon/flow` provides reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom without D3, auto-layout via lazy-loaded elkjs, and per-node O(1) reactivity. Built from the ground up for signal-based frameworks — each node mounts **exactly once** across the lifetime of the graph, and a drag, selection click, or `updateNode` patches that node in place instead of remounting it.

<PackageBadge name="@pyreon/flow" href="/docs/flow" />

:::note
`@pyreon/flow` lists `@pyreon/runtime-dom` as a **peer dependency**. Flow's JSX components emit `_tpl()` / `_bind()` calls that need runtime-dom imports — declare it as a direct dependency in your app, not a transitive one.
:::

## Installation

:::code-group

```bash [npm]
npm install @pyreon/flow @pyreon/runtime-dom
```

```bash [bun]
bun add @pyreon/flow @pyreon/runtime-dom
```

```bash [pnpm]
pnpm add @pyreon/flow @pyreon/runtime-dom
```

```bash [yarn]
yarn add @pyreon/flow @pyreon/runtime-dom
```

:::

## Quick Start

```tsx
import { createFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'

const flow = createFlow({
  fitView: true,
  nodes: [
    { id: '1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Start' } },
    { id: '2', position: { x: 200, y: 100 }, data: { label: 'Process' } },
    { id: '3', type: 'output', position: { x: 400, y: 0 }, data: { label: 'End' } },
  ],
  edges: [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
  ],
})

function WorkflowBuilder() {
  return (
    <Flow instance={flow}>
      <Background />
      <MiniMap />
      <Controls />
    </Flow>
  )
}
```

No callbacks, no `applyNodeChanges`. The flow instance manages everything.

<Example file="./examples/flow/node-graph-drag-select-connect" title="Node graph — drag, select, connect" />

### Playground

The kitchen-sink demo — every visible feature in one graph. Click an **auto-layout** button (`layered →`, `layered ↓`, `tree`, `force`) and the nodes animate to the elkjs-computed positions. The edges show the full **arrow** vocabulary: filled `ArrowClosed`, open `Arrow` chevrons, per-edge colours, and a both-ends marker. Drag any node, click to select, drag from a node edge to connect.

<Example file="./examples/flow/flow-playground" title="Flow playground — arrows + auto-layout + every overlay" />

## Creating a Flow

`createFlow()` accepts a config object and returns a reactive `FlowInstance`:

```tsx
const flow = createFlow({
  nodes: [...],
  edges: [...],
  snapToGrid: true,
  snapGrid: 20,
  connectionRules: { input: { outputs: ['process'] } },
  nodeExtent: [[0, 0], [1000, 800]],
})
```

### Generic over node data

`createFlow<TData>(...)` is generic over the shape of each node's `data` payload. Pass your type explicitly and `node.data.kind` narrows correctly — **no `[key: string]: unknown` index signature** required on your data interface:

```tsx
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
  ],
  edges: [],
})

// node.data.kind narrows to the typed union, not `unknown`
const triggers = flow.findNodes((n) => n.data.kind === 'trigger')
```

When no generic is supplied it defaults to `Record<string, unknown>`.

### Config Options

| Option                      | Type                                       | Default | Description                                                          |
| --------------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------------- |
| `nodes`                     | `FlowNode<TData>[]`                        | `[]`    | Initial nodes                                                        |
| `edges`                     | `FlowEdge[]`                               | `[]`    | Initial edges                                                        |
| `defaultEdgeType`           | `EdgeType`                                 | `'bezier'` | Edge type applied when an edge omits `type`                       |
| `defaultEdgeOptions`        | `DefaultEdgeOptions`                       | —       | Defaults merged into every edge that doesn't set the field itself (see [Default Edge Options](#default-edge-options)) |
| `minZoom`                   | `number`                                   | `0.1`   | Minimum zoom level                                                   |
| `maxZoom`                   | `number`                                   | `4`     | Maximum zoom level                                                   |
| `snapToGrid`                | `boolean`                                  | `false` | Snap node positions to a grid                                        |
| `snapGrid`                  | `number`                                   | `15`    | Grid size in pixels                                                  |
| `snapToObjects`             | `boolean`                                  | `true`  | Align-to-other-nodes helper lines on drag (see [Object Snapping](#object-snapping-drag-perf)) |
| `connectionRules`           | `ConnectionRule`                           | —       | Validate connections by source node **type** (see [Connection Rules](#connection-rules)) |
| `nodesDraggable`            | `boolean`                                  | `true`  | Whether nodes are draggable by default                               |
| `nodesConnectable`          | `boolean`                                  | `true`  | Whether nodes are connectable by default                             |
| `nodesSelectable`           | `boolean`                                  | `true`  | Whether nodes are selectable by default                              |
| `multiSelect`               | `boolean`                                  | `true`  | Allow multi-selection                                                |
| `nodeExtent`                | `[[minX, minY], [maxX, maxY]]`             | —       | Constrain node positions within bounds                              |
| `pannable`                  | `boolean`                                  | `true`  | Whether panning is enabled                                           |
| `zoomable`                  | `boolean`                                  | `true`  | Whether zooming is enabled                                           |
| `fitView`                   | `boolean`                                  | `false` | Fit all nodes in the viewport on initial render                      |
| `fitViewPadding`            | `number`                                   | `0.1`   | Padding ratio used by `fitView()`                                    |
| `defaultMarkerEnd`          | `EdgeMarkerSpec \| null`                   | `{ type: ArrowClosed }` | Default END arrowhead; `null` makes edges arrowless |
| `onlyRenderVisibleElements` | `boolean`                                  | `false` | Cull off-screen nodes/edges (see [Render Virtualization](#render-virtualization)) |

:::warning
`nodeExtent` is `[[minX, minY], [maxX, maxY]]` — a tuple of corner points, **not** `{ x: [min, max], y: [min, max] }`. The same tuple shape is accepted by `flow.setNodeExtent(...)`.
:::

### `useFlow(config)` — Component-Scoped Flows

For flows that live and die with a component, use `useFlow` instead of `createFlow`. It wraps the instance with an `onUnmount(() => flow.dispose())` so you don't write the disposal boilerplate yourself. It has the **identical signature** to `createFlow` (including the `<TData>` generic).

```tsx
import { useFlow, Flow, Background } from '@pyreon/flow'

const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } }],
    edges: [],
  })

  return (
    <Flow instance={flow}>
      <Background />
    </Flow>
  )
}
```

Use `createFlow` directly only when the flow is owned **outside** the component tree (app store, singleton, SSR-shared state) — those cases require a manual `flow.dispose()` at the correct lifecycle point.

:::warning
`useFlow` must be called inside a component body — the `onUnmount` registration requires an active component setup context, the same constraint as every `useX` hook. Calling `createFlow` inside a component and forgetting `onUnmount(() => flow.dispose())` is exactly the foot-gun `useFlow` exists to prevent.
:::

## Reactive Signals

All state is exposed as reactive signals. `nodes`, `edges`, `viewport`, and `containerSize` are writable `Signal`s; the rest are derived `Computed`s.

```tsx
flow.nodes()         // Signal<FlowNode<TData>[]>
flow.edges()         // Signal<FlowEdge[]>
flow.viewport()      // Signal<Viewport> — { x, y, zoom }
flow.containerSize() // Signal<{ width, height }> — set by <Flow> via ResizeObserver
flow.zoom()          // Computed<number> — just the zoom level
flow.selectedNodes() // Computed<string[]> — selected node ids
flow.selectedEdges() // Computed<string[]> — selected edge ids
flow.nodeMap()       // Computed<Map<string, FlowNode>> — O(1) lookup, rebuilt once per nodes() change
flow.edgeMap()       // Computed<Map<string, FlowEdge>> — O(1) lookup, rebuilt once per edges() change
```

:::warning
`selectedNodes()` / `selectedEdges()` return arrays of **ids** (`string[]`), not the node/edge objects. Pair them with `getNode` / `getEdge` (or `nodeMap()`) to resolve.
:::

:::tip
`nodeMap()` / `edgeMap()` are the reason a drag stays cheap. A drag frame writes the whole `nodes()` array, notifying every per-node and per-edge thunk — but each thunk does an O(1) `nodeMap().get(id)` rather than an O(n) `nodes().find(...)`, so per-frame cost is O(N) total (one map rebuild + N lookups), not O(N²).
:::

## Custom Node Renderers

Register custom node components by `node.type` via `<Flow nodeTypes={{ ... }}>`. The component receives `NodeComponentProps<TData>`.

**Every prop except `id` is a reactive accessor** (`() => T`), not a plain value. Read each one **inside a reactive scope** — a JSX expression thunk, `effect()`, or `computed()` — so the node patches in place when the underlying state changes.

```tsx
import { Flow, Handle, Position, type NodeComponentProps } from '@pyreon/flow'

function CustomNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={() => (props.selected() ? 'node selected' : 'node')}
      style={() => `cursor: ${props.dragging() ? 'grabbing' : 'grab'}`}
    >
      <Handle type="target" position={Position.Left} />
      {() => props.data().label}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

<Flow instance={flow} nodeTypes={{ custom: CustomNode }}>
  <Background />
</Flow>
```

| Prop         | Type            | Description                                                         |
| ------------ | --------------- | ------------------------------------------------------------------- |
| `id`         | `string`        | Stable node identity — never changes; the keyed identity, plain string |
| `data`       | `() => TData`   | Accessor for the node's current `data` (reflects `updateNode` mutations) |
| `selected`   | `() => boolean` | Accessor — whether the node is selected                             |
| `dragging`   | `() => boolean` | Accessor — whether the node is being dragged                        |

:::warning[**Read the accessors, don't capture them**]
`props.data`, `props.selected`, and `props.dragging` are **accessor functions** — call them: `props.data()`, `props.selected()`, `props.dragging()`. Reading them OUTSIDE a reactive scope (e.g. `const label = props.data().label` at the top of the component body) captures the value **once at mount** and defeats the per-node reactivity. Read them inside JSX expression thunks, `effect()`, or `computed()`. The component runs once — that's how each node mounts exactly once regardless of how many drags / selections / `updateNode` calls happen.
:::

Custom **edge** renderers (registered via `edgeTypes={{ ... }}`) follow the same contract — `sourceX`/`sourceY`/`targetX`/`targetY`/`selected` are all accessors recomputed when the endpoints move.

## Node Operations

```tsx
// Add a node
flow.addNode({ id: '4', position: { x: 300, y: 200 }, data: { label: 'New Node' } })

// Remove a node (also removes connected edges)
flow.removeNode('4')

// Update node properties (shallow-merged onto the node)
flow.updateNode('2', { data: { label: 'Updated' } })

// Update position (respects snapToGrid and nodeExtent clamping)
flow.updateNodePosition('2', { x: 250, y: 150 })

// Get a specific node
const node = flow.getNode('2') // FlowNode<TData> | undefined
```

:::warning
Don't mutate the array returned by `flow.nodes()` directly — go through `addNode` / `updateNode` / `removeNode` so the internal signals fire. A direct push won't update the DOM.
:::

## Edge Operations

```tsx
// Add an edge — id auto-generated from source/target if not provided
flow.addEdge({ source: '1', target: '3' })

// Add with type and label
flow.addEdge({ source: '1', target: '3', type: 'smoothstep', label: 'yes' })

// Remove an edge by id (auto-generated ids look like `e-1-3`)
flow.removeEdge('e-1-3')

// Get a specific edge
const edge = flow.getEdge('e-1-3')

// Reconnect an edge to a new source/target (or handles)
flow.reconnectEdge('e-1-3', { target: '5' })
```

Duplicate edges (same generated id) are silently skipped by `addEdge`.

:::note
When an edge omits `id`, it's auto-generated as `e-<source>-<target>` (with `-<handle>` suffixes when source/target handles are set). Pass an explicit `id` if you need a stable, predictable key.
:::

### Edge Types

Four built-in edge path algorithms (set per edge via `type`, or graph-wide via `defaultEdgeType`):

| Type         | Description                           |
| ------------ | ------------------------------------- |
| `bezier`     | Smooth cubic bezier curve (default)   |
| `smoothstep` | Right-angle path with rounded corners |
| `step`       | Right-angle path with sharp corners   |
| `straight`   | Direct line between nodes             |

`EdgeType` is `'bezier' | 'smoothstep' | 'straight' | 'step' | (string & {})` — the open string union lets you register custom edge renderers under any name via `<Flow edgeTypes={{ ... }}>`.

### Per-Edge Path Options

Each built-in path builder is tunable per edge via `pathOptions` (only the fields relevant to the edge's `type` apply):

```tsx
// A flatter bezier (default curvature is 0.25; 0 = straight line)
flow.addEdge({ source: '1', target: '2', pathOptions: { curvature: 0.1 } })

// A smoothstep with bigger rounded corners and a longer straight run-out
flow.addEdge({
  source: '2',
  target: '3',
  type: 'smoothstep',
  pathOptions: { borderRadius: 12, offset: 40 },
})

// A step edge that runs 60px straight out of each endpoint before turning
flow.addEdge({ source: '3', target: '4', type: 'step', pathOptions: { offset: 60 } })
```

| Field          | Applies to           | Default | Description                                                        |
| -------------- | -------------------- | ------- | ------------------------------------------------------------------ |
| `curvature`    | `bezier`             | `0.25`  | Control-point strength as a fraction of endpoint distance          |
| `borderRadius` | `smoothstep`         | `5`     | Corner rounding radius in px (`step` locks this to `0`)            |
| `offset`       | `smoothstep`, `step` | `20`    | Straight run-out from each endpoint before the first turn, in px   |

`straight` and waypoint-routed edges ignore `pathOptions`.

### Default Edge Options

`defaultEdgeOptions` merges defaults into every edge that doesn't set the field itself — the initial `edges` array, every `addEdge()`, and every connection drawn by the user:

```tsx
const flow = createFlow({
  nodes,
  edges,
  defaultEdgeOptions: {
    type: 'smoothstep',
    animated: true,
    pathOptions: { borderRadius: 8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
  },
})
```

A per-edge explicit value always wins — including an explicit `markerEnd: null` (arrowless opt-out). `type` resolves as `edge.type` → `defaultEdgeOptions.type` → `defaultEdgeType` → `'bezier'`.

### Edge Waypoints

Add bend points to edges:

```tsx
flow.addEdgeWaypoint('e-1-2', { x: 150, y: 50 })
flow.addEdgeWaypoint('e-1-2', { x: 200, y: 75 }, 1) // insert at a specific index
flow.updateEdgeWaypoint('e-1-2', 0, { x: 160, y: 60 })
flow.removeEdgeWaypoint('e-1-2', 0)
```

### Edge Markers

See the [playground](#playground) above for every marker shape rendered live.

Configurable arrowheads on either end of an edge. Two shapes — `MarkerType.ArrowClosed` (filled triangle, the default) and `MarkerType.Arrow` (open chevron) — with optional `color` / `width` / `height` / `strokeWidth`. Identical marker configs are deduplicated into a single shared `<defs>` entry across the whole graph, and the `<defs>` set rebuilds reactively as edges are added/removed.

```tsx
import { MarkerType } from '@pyreon/flow'

flow.addEdge({ id: 'e1', source: '1', target: '2' })                              // default closed arrow at end
flow.addEdge({ id: 'e2', source: '2', target: '3', markerEnd: MarkerType.Arrow }) // open chevron
flow.addEdge({
  id: 'e3',
  source: '3',
  target: '4',
  markerStart: MarkerType.ArrowClosed,                                            // arrow on BOTH ends
  markerEnd: { type: MarkerType.Arrow, color: '#ff0000', width: 14 },
})
flow.addEdge({ id: 'e4', source: '4', target: '5', markerEnd: null })              // explicitly arrowless
```

Set the graph-wide default (or turn arrows off everywhere) in the flow config:

```tsx
const flow = createFlow({
  nodes,
  edges,
  defaultMarkerEnd: null, // every edge arrowless unless it opts in via markerEnd
})
```

:::warning
`markerEnd: null` is **not** the same as omitting `markerEnd`. `null` is the explicit "no end arrow" opt-out that overrides `defaultMarkerEnd`; **omitting** `markerEnd` falls back to the flow default (a closed arrowhead unless you set `defaultMarkerEnd: null`). `markerStart` is omitted by default (no start arrow). Resolved marker defaults: `color: '#999'`, `width: 10`, `height: 7`, `strokeWidth: 1`.
:::

## Edge Anchoring & Node Measurement

Where exactly an edge attaches to a node is resolved per endpoint, in priority order:

1. **A measured `<Handle>` dot.** The renderer measures every node's real DOM box *and* every `<Handle>` dot's center (client-only, via a per-node `ResizeObserver`). `edge.sourceHandle` / `edge.targetHandle` anchor the edge **exactly at the named dot** — wherever your CSS placed it. An edge with no handle id uses the node's *first* handle of the right type (source/target).
2. **A config handle.** A handle declared in `node.sourceHandles` / `node.targetHandles` that hasn't been measured yet (first frame, SSR) anchors at its declared side's midpoint.
3. **Floating endpoints.** A node with **no** handles connects where the center-to-center line crosses its perimeter — the edge approaches at the natural angle instead of docking at a fixed side midpoint (React Flow's floating-edge model). This is the default for plain nodes.

```tsx
// Anchors at the 'out-fallback' dot's real rendered position:
flow.addEdge({ source: '1', sourceHandle: 'out-fallback', target: '2' })
```

An edge that names a handle id that exists on neither the measured dots nor the config handles anchors at the node's first handle instead and **dev-warns once** naming the known ids — a typo never silently produces a dead edge.

### Measured node dimensions

Nodes don't need explicit `width` / `height` — the renderer measures the real rendered box and every geometry consumer uses the same **effective dimensions** rule:

> explicit `node.width` / `node.height` → measured DOM size → `150×40` default

That rule drives edge anchoring, **auto-layout** (ELK receives real boxes), `fitView`, drag snap lines, rubber-band selection hit-tests, the minimap, `<NodeResizer>`'s starting size, and viewport culling. Read a node's effective box imperatively via `flow.getNodeDimensions(id)`, or reactively via the `flow.measurements()` map (`Map<string, NodeMeasurement>` — size plus measured handle dots).

:::note
Explicit `width` / `height` always win — set them when you need layout to run **before** first render (SSR, headless `computeLayout`), or when `<NodeResizer>` writes them. Under SSR / happy-dom nothing is measured, so geometry falls back to explicit-or-default.
:::

## Selection

```tsx
flow.selectNode('1')                  // select a node (replaces selection)
flow.selectNode('2', true)            // additive — add to selection (2nd arg is `additive`)
flow.deselectNode('1')                // remove from selection
flow.selectEdge('e-1-2')              // select an edge
flow.selectEdge('e-2-3', true)        // additive
flow.selectAll()                      // select all nodes
flow.clearSelection()                 // deselect everything
flow.deleteSelected()                 // remove selected nodes and edges
flow.moveSelectedNodes(20, 0)         // move every selected node by dx/dy
```

:::note
`selectNode` / `selectEdge` take a positional `additive` boolean as the second argument — `selectNode('2', true)`, not `selectNode('2', { additive: true })`. Selecting a node clears edge selection (and vice-versa) unless `additive` is true.
:::

## Viewport

```tsx
flow.zoomIn()                      // zoom in (×1.2, clamped to maxZoom)
flow.zoomOut()                     // zoom out (÷1.2, clamped to minZoom)
flow.zoomTo(1.5)                   // set exact zoom (clamped to min/max)
flow.fitView()                     // fit all nodes in viewport
flow.fitView(['1', '2'])           // fit specific nodes
flow.fitView(['1', '2'], 0.2)      // with a custom padding ratio
flow.panTo({ x: 100, y: 200 })     // pan so a graph position is at the origin
flow.focusNode('3')                // pan to center a node + select it
flow.focusNode('3', 1.5)           // ...with a target zoom
flow.animateViewport({ zoom: 2 })  // animate viewport to a partial target (default 300ms)

flow.zoom()                        // Computed<number> — reactive zoom level
flow.isNodeVisible('1')            // boolean — is the node within the current viewport
```

### Render Virtualization

For large graphs, set `onlyRenderVisibleElements: true` so only nodes whose screen rect intersects the viewport (expanded by a margin so they don't pop in at the edge) — and the edges touching at least one visible node — are mounted in the DOM. The rendered set re-filters reactively on pan and zoom.

```tsx
const flow = createFlow({
  nodes, // thousands of nodes
  edges,
  onlyRenderVisibleElements: true,
})
```

:::warning
An edge whose line crosses the viewport while **both** its endpoint nodes are off-screen is culled — only edges anchored to at least one visible node are kept. This matches React Flow and is rare in practice, but means a single very long edge between two distant off-screen clusters won't draw while you're zoomed into the middle. Off by default; every node/edge renders unless you opt in.
:::

### Object Snapping (drag perf)

By default a dragged node snaps to align with other nodes' edges and centers, drawing helper guide lines (`snapToObjects: true`). That alignment scan runs over **every** node on **every** drag frame — on large graphs it's the dominant per-frame cost. Turn it off to skip the scan entirely:

```tsx
const flow = createFlow({
  nodes, // hundreds / thousands of nodes
  edges,
  snapToObjects: false, // skip the per-frame O(N) align scan — ~3-4× faster drags
})
```

Measured (60-frame drag): N=1000 `1.34ms → 0.31ms`, N=3000 `3.36ms → 0.78ms`. Default stays `true` so existing apps keep helper-line snapping; set `false` when you don't need it (or use `snapToGrid` for grid quantization instead, which is a separate, cheap mechanism).

## Auto-Layout

The [playground](#playground) above has live `layered`, `tree`, and `force` buttons — click them to watch the layout animate.

Layout nodes automatically using elkjs (lazy-loaded — the elkjs chunk is only fetched when `flow.layout()` is first called):

```tsx
// Layered layout (DAG/pipeline)
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })

// Tree layout
await flow.layout('tree', { direction: 'DOWN', nodeSpacing: 40 })

// Force-directed
await flow.layout('force', { nodeSpacing: 80 })

// Other algorithms
await flow.layout('stress')
await flow.layout('radial')
await flow.layout('box')
await flow.layout('rectpacking')
```

`flow.layout(algorithm?, options?)` defaults to `'layered'`. It returns a `Promise<void>` and (unless `animate: false`) interpolates node positions over `animationDuration` with an ease-out cubic.

`flow.layout()` feeds ELK each node's **effective dimensions** (explicit → measured DOM size → default, see [Measured node dimensions](#measured-node-dimensions)) — content-sized custom nodes are laid out at their real rendered size, so spacing is correct instead of assuming 150×40 boxes. The standalone `computeLayout(nodes, edges, algorithm?, options?)` export has no DOM access and uses explicit-or-default sizes; set `width`/`height` on the nodes you pass it for precise headless layout.

### Layout Options

| Option              | Type                                      | Default        | Description                        |
| ------------------- | ----------------------------------------- | -------------- | ---------------------------------- |
| `direction`         | `'UP' \| 'DOWN' \| 'LEFT' \| 'RIGHT'`     | `'DOWN'`       | Layout direction                   |
| `nodeSpacing`       | `number`                                  | `50`           | Spacing between nodes              |
| `layerSpacing`      | `number`                                  | `80`           | Spacing between layers             |
| `edgeRouting`       | `'orthogonal' \| 'splines' \| 'polyline'` | `'orthogonal'` | How edges are routed               |
| `animate`           | `boolean`                                 | `true`         | Animate the layout transition      |
| `animationDuration` | `number`                                  | `300`          | Animation duration in milliseconds |

#### Algorithm Applicability

Not every option applies to every algorithm — ELK namespaces options under specific pipelines, so passing `direction` to a force layout has zero effect. The table below is **empirically verified** (each cell records whether running the algorithm twice with two different values for that option produces a different layout `✅` or an identical one `❌`):

| Option         | `layered` | `tree` | `force` | `stress` | `radial` | `box` | `rectpacking` |
| -------------- | :-------: | :----: | :-----: | :------: | :------: | :---: | :-----------: |
| `direction`    |     ✅    |   ✅   |    ❌   |    ❌    |    ❌    |   ❌  |       ❌      |
| `nodeSpacing`  |     ✅    |   ✅   |    ✅   |    ✅    |    ✅    |   ✅  |       ✅      |
| `layerSpacing` |     ✅    |   ❌   |    ❌   |    ❌    |    ❌    |   ❌  |       ❌      |
| `edgeRouting`  |     ✅    |   ❌   |    ❌   |    ❌    |    ❌    |   ❌  |       ❌      |

:::warning
`direction`, `layerSpacing`, and `edgeRouting` are namespaced under ELK's layered/tree pipelines. The other algorithms (`force`, `stress`, `radial`, `box`, `rectpacking`) accept the option in `LayoutOptions` (so it typechecks) but **silently ignore** the value at layout time. Setting one of these on an algorithm that ignores it fires a **dev-mode `console.warn`** (tree-shaken in production — the gate is the bundler-agnostic `process.env.NODE_ENV !== 'production'`). `nodeSpacing` is the only option respected by every algorithm. Use `layered` or `tree` if you need a directional layout.
:::

The same logic is exposed standalone as `computeLayout(nodes, edges, algorithm?, options?)`, which returns `Promise<Array<{ id, position }>>` without mutating the flow — useful if you want to compute positions and apply them yourself.

## Connection Rules

Define type-safe rules for which node **types** can connect. The map is keyed by **source node type**; each rule lists the target types that source may connect to under `outputs`:

```tsx
const flow = createFlow({
  nodes: [...],
  edges: [...],
  connectionRules: {
    input: { outputs: ['process'] },
    process: { outputs: ['process', 'output'] },
    output: { outputs: [] },
  },
})

// Check if a connection is valid
flow.isValidConnection({ source: '1', target: '2' }) // boolean
```

:::warning
The rule field is **`outputs`**, keyed by the **source node's `type`** — not `allowedTargets`. A source whose type has no rule entry is allowed to connect anywhere (the rules are an allowlist applied only to types that appear in the map). `isValidConnection` resolves each endpoint's `type` (defaulting to `'default'`) and returns `false` if either node id doesn't exist.
:::

## Graph Queries

```tsx
flow.getConnectedEdges('2') // FlowEdge[] — all edges touching the node
flow.getIncomers('2')       // FlowNode<TData>[] — nodes with edges pointing TO this node
flow.getOutgoers('2')       // FlowNode<TData>[] — nodes this node points to
flow.getChildNodes('group') // FlowNode<TData>[] — nodes whose parentId === 'group'
flow.getAbsolutePosition('2') // XYPosition — position accounting for parent offsets (cycle-safe)
```

## Search and Filter

```tsx
flow.findNodes((n) => n.type === 'process') // FlowNode<TData>[] — by predicate
flow.searchNodes('start')                   // FlowNode<TData>[] — by data.label text (case-insensitive)
```

:::note
`searchNodes` matches against a `label` string on each node's `data` payload (falling back to the node `id` when no label is present). It's a convenience for the common `data.label` convention and works even when `TData` doesn't formally declare a `label` field.
:::

## Undo / Redo

```tsx
flow.pushHistory() // snapshot the current nodes + edges onto the undo stack
flow.undo()        // restore the previous snapshot
flow.redo()        // re-apply an undone snapshot
```

:::note
The undo/redo history is **manual** — call `flow.pushHistory()` before a mutation you want to be undoable. The history is capped at 50 snapshots; a fresh `pushHistory` clears the redo stack. `undo`/`redo` clear the current selection.
:::

## Copy / Paste

```tsx
flow.copySelected()      // copy selected nodes (and edges between them) to an internal clipboard
flow.paste()             // paste with a { x: 50, y: 50 } offset, fresh ids, and select the result
flow.paste({ x: 20, y: 20 }) // custom offset
```

:::warning
The copy method is `copySelected()`, not `copy()`. Pasted nodes get new ids (suffixed with a monotonic counter, collision-free under rapid paste) and only edges whose **both** endpoints are in the selection are copied.
:::

## Collision Detection

```tsx
flow.getOverlappingNodes('2') // FlowNode<TData>[] — nodes whose bounding box overlaps
flow.resolveCollisions('2')   // push overlapping nodes apart (optional 2nd arg = spacing, default 10)
```

## Proximity Connect

```tsx
// Find the nearest unconnected node within `threshold` px → a Connection or null
flow.getProximityConnection('1', 200) // Connection | null
```

:::warning
The proximity API is `getProximityConnection(nodeId, threshold?)` and returns a `Connection` (`{ source, target }`) — or `null` if nothing qualifies or the resulting connection fails `isValidConnection`. It does **not** return a `FlowNode`. `threshold` defaults to `50`.
:::

## Node Extent (drag boundaries)

```tsx
flow.setNodeExtent([[0, 0], [1000, 800]]) // clamp all node drags within bounds
flow.setNodeExtent(null)                  // remove the boundary
flow.clampToExtent({ x: 1200, y: 50 })    // → XYPosition clamped to the current extent
```

`updateNodePosition` and drags automatically respect the active extent.

## Serialization

```tsx
// Export flow state as a JSON-serializable object
const json = flow.toJSON()
// { nodes: [...], edges: [...], viewport: { x, y, zoom } }

// Import flow state (clears selection; edges get ids/types backfilled)
flow.fromJSON(json)
flow.fromJSON({ nodes, edges }) // viewport optional — omit to keep the current one
```

`toJSON()` returns a structural deep clone, so the result is safe to mutate / persist without affecting the live graph.

## Listeners

Every listener returns an unsubscribe function.

```tsx
const off = flow.onConnect((connection) => {
  console.log('Connected:', connection.source, '→', connection.target)
})
off() // unsubscribe

flow.onNodesChange((changes) => {
  // changes: NodeChange[] — { type: 'position' | 'dimensions' | 'select' | 'remove', ... }
})

flow.onNodeClick((node) => { /* FlowNode<TData> */ })
flow.onEdgeClick((edge) => { /* FlowEdge */ })
flow.onNodeDragStart((node) => { /* drag begins */ })
flow.onNodeDragEnd((node) => { /* drag ends */ })
flow.onNodeDoubleClick((node) => { /* double click */ })
```

## Batch Operations

```tsx
flow.batch(() => {
  flow.addNode({ id: '10', position: { x: 0, y: 0 }, data: { label: 'A' } })
  flow.addNode({ id: '11', position: { x: 200, y: 0 }, data: { label: 'B' } })
  flow.addEdge({ source: '10', target: '11' })
})
// One signal notification for all changes — one render pass instead of three
```

## Components

`<Flow>` is the container. Place `<Background>`, `<MiniMap>`, `<Controls>`, `<Panel>` (and `<NodeResizer>` / `<NodeToolbar>` inside custom nodes) as children.

### `<Flow>`

The main container. `fitView` is a `createFlow` config option, **not** a `<Flow>` prop. `<Flow>` accepts `instance` (required), optional `nodeTypes` / `edgeTypes` renderer maps, plus `style` / `class` / `children`.

```tsx
const flow = createFlow({ fitView: true, nodes, edges })

<Flow instance={flow} nodeTypes={{ custom: MyNode }} style="width: 100%; height: 600px;">
  <Background />
  <MiniMap />
  <Controls />
</Flow>
```

:::warning
`<Flow<MyData> />` is **invalid JSX** — Pyreon components can't be parameterised at the call site. `FlowProps.instance` is typed as `FlowInstance<any>`, so a typed `FlowInstance<MyData>` from `createFlow<MyData>(...)` passes through without a cast. The same applies to `MiniMap`'s `nodeColor` callback, which receives `FlowNode<any>`.
:::

### `<Background>`

Decorative background pattern that moves with the viewport. `variant` is `'dots'` (default), `'lines'`, or `'cross'`. Other props: `gap` (default `20`), `size` (default `1`), `color` (default `'#ddd'`).

```tsx
<Background variant="dots" gap={20} size={1} />
<Background variant="lines" gap={20} color="#e5e7eb" />
<Background variant="cross" gap={20} />
```

### `<MiniMap>`

Scaled overview with a viewport indicator. Clicks recenter the main viewport.

```tsx
<MiniMap
  nodeColor={(node) => (node.type === 'input' ? '#6366f1' : '#94a3b8')}
  maskColor="rgba(0,0,0,0.2)"
/>
```

Props: `nodeColor` (`string` or `(node) => string`, default grey), `maskColor`, `width`, `height`, `style`, `class`.

### `<Controls>`

Zoom in / zoom out / fit-view button cluster (plus a live zoom-% readout). All buttons are toggleable:

```tsx
<Controls showFitView showZoomIn showZoomOut showLock position="bottom-left" />
```

Props (all optional): `showZoomIn` (default `true`), `showZoomOut` (default `true`), `showFitView` (default `true`), `showLock` (default `false`), `position` (default `'bottom-left'`).

### Overlay child order

Overlay order no longer matters on current Pyreon versions — `<Controls>`, `<MiniMap>`, `<Background>`, `<Panel>`, `<NodeResizer>`, and `<NodeToolbar>` can sit in any position:

```tsx
<Flow instance={flow}>
  <Background />
  <Controls />
  <MiniMap />
</Flow>
```

:::note
On **older `@pyreon/compiler` versions** (before the template ref-hoist release), a `<Controls>` mounted as a sibling **before** a `<MiniMap>` silently failed to render — its DOM was never mounted (a compiler slot-ordering bug: an earlier dynamic slot shifted the sibling element-ref walk). If you're pinned to an older version, place `<MiniMap>` before `<Controls>` to sidestep it. The bug is fixed in current versions — templates capture all sibling refs before any slot mounts.
:::

### `<Handle>`

Connection point on a custom node — place inside a node renderer. `type` is `'source'` or `'target'`, `position` is a `Position` enum value. Give multiple source/target handles distinct `id`s so edges can reference a specific one via `sourceHandle` / `targetHandle`.

```tsx
import { Handle, Position } from '@pyreon/flow'

function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div class="custom-node">
      <Handle type="target" position={Position.Left} />
      <span>{() => props.data().label}</span>
      <Handle type="source" position={Position.Right} id="out-primary" />
      <Handle type="source" position={Position.Bottom} id="out-fallback" />
    </div>
  )
}

// Reference a specific handle by id
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })
```

Edges anchor at the dot's **real rendered position** — the renderer measures every `<Handle>`'s center (see [Edge Anchoring & Node Measurement](#edge-anchoring--node-measurement)), so restyling or repositioning a dot via `style` / `class` moves the edge attachment with it. An edge without a `sourceHandle` / `targetHandle` id uses the node's first handle of that type.

:::warning
Multiple `source` or `target` handles on one node need distinct `id` values, or edges can't disambiguate which handle they connect to (an unknown id anchors at the first handle and dev-warns naming the known ids). Handles must live inside a node renderer — nesting a `<Handle>` in a `<Background>`, `<Panel>`, or other non-node component breaks the connection machinery.
:::

### `<Panel>`

Positioned overlay for toolbars, legends, or action buttons. `position` is one of `'top-left'` / `'top-right'` / `'bottom-left'` / `'bottom-right'` (default `'top-left'`). Pass any JSX as children.

```tsx
<Panel position="top-right">
  <button onClick={() => flow.fitView()}>Fit</button>
  <button onClick={() => flow.toJSON()}>Export</button>
</Panel>
```

### `<NodeResizer>`

Drag handles for resizing a node — place inside a custom node component. Requires both `nodeId` and the `instance`.

```tsx
function ResizableNode(props: NodeComponentProps<MyData>) {
  return (
    <div style="min-width: 100px; min-height: 50px; position: relative;">
      {() => props.data().label}
      <NodeResizer nodeId={props.id} instance={flow} />
    </div>
  )
}
```

Props: `nodeId` (required), `instance` (required `FlowInstance`), `minWidth` (default `50`), `minHeight` (default `30`), `handleSize` (default `8`), `showEdgeHandles` (default `false` — corners only).

### `<NodeToolbar>`

Floating toolbar near a node, shown when the node is selected. Pass the node's `selected` accessor so it shows/hides reactively.

```tsx
function EditableNode(props: NodeComponentProps<MyData>) {
  return (
    <div class="node">
      {() => props.data().label}
      <NodeToolbar selected={props.selected} position="top">
        <button>Edit</button>
        <button>Delete</button>
      </NodeToolbar>
    </div>
  )
}
```

Props: `position` is `'top'` / `'bottom'` / `'left'` / `'right'` (a string, **not** a `Position` enum value; default `'top'`), `offset` (default `8`), `showOnSelect` (default `true`), `selected` (`boolean` or `() => boolean`), `style`, `class`, `children`.

:::warning
`<NodeToolbar position="top">` takes a plain string (`'top' | 'bottom' | 'left' | 'right'`), not the `Position` enum — and it's driven by `selected`, not a `nodeId`. Pass `selected={props.selected}` (the accessor) so the toolbar tracks live selection.
:::

## Theming

Every color the flow renderer emits goes through a `--pyreon-flow-*` CSS custom property with the historical light-mode value as fallback — **zero setup for light apps, one CSS block to re-skin everything** (dark mode, brand colors). Set them on the flow container or any ancestor:

```css
.dark .pyreon-flow {
  --pyreon-flow-node-bg: #1e293b;
  --pyreon-flow-node-color: #e2e8f0;
  --pyreon-flow-node-border: #334155;
  --pyreon-flow-edge: #64748b;
  --pyreon-flow-bg-pattern: #334155;
  --pyreon-flow-accent: #818cf8;
}
```

The full vocabulary:

| Variable | Fallback | Themes |
| --- | --- | --- |
| `--pyreon-flow-accent` | `#3b82f6` | Selected edge stroke, connection line, snap helper lines, selection-box border, resizer border, handle hover, minimap viewport outline |
| `--pyreon-flow-accent-bg` | `rgba(59, 130, 246, 0.08)` | Rubber-band selection-box fill |
| `--pyreon-flow-bg-pattern` | `#ddd` | `<Background>` dots / lines / cross pattern |
| `--pyreon-flow-node-bg` | `#fff` | Default node background |
| `--pyreon-flow-node-color` | `#1a192b` | Default node text |
| `--pyreon-flow-node-border` | `#ddd` | Default node border |
| `--pyreon-flow-node-selected` | `#3b82f6` | Default node border when selected |
| `--pyreon-flow-selection-glow` | `rgba(59, 130, 246, 0.3)` | Selected node drop-shadow ring (`flowStyles`) |
| `--pyreon-flow-edge` | `#999` | Edge stroke + default arrowhead color |
| `--pyreon-flow-edge-label` | `#666` | Edge label text |
| `--pyreon-flow-handle-bg` | `#555` | `<Handle>` dot fill |
| `--pyreon-flow-handle-border` | `white` | `<Handle>` dot border ring |
| `--pyreon-flow-handle-valid` | `#22c55e` | Target-handle hover (valid drop) color (`flowStyles`) |
| `--pyreon-flow-control-color` | `#555` | `<Controls>` button glyphs |
| `--pyreon-flow-control-muted` | `#999` | `<Controls>` zoom-percent readout |
| `--pyreon-flow-controls-hover` | `#f3f4f6` | `<Controls>` button hover background (`flowStyles`) |
| `--pyreon-flow-controls-active` | `#e5e7eb` | `<Controls>` button pressed background (`flowStyles`) |
| `--pyreon-flow-panel-bg` | `#fff` | `<Panel>` / `<Controls>` surface background |
| `--pyreon-flow-panel-border` | `#ddd` | `<Panel>` / `<Controls>` surface border |
| `--pyreon-flow-panel-shadow` | `rgba(0,0,0,0.08)` | `<Panel>` / `<Controls>` drop shadow |
| `--pyreon-flow-toolbar-bg` | `white` | `<NodeToolbar>` background |
| `--pyreon-flow-toolbar-border` | `#ddd` | `<NodeToolbar>` border |
| `--pyreon-flow-resizer-bg` | `white` | `<NodeResizer>` handle fill (border uses `--pyreon-flow-accent`) |
| `--pyreon-flow-minimap-node` | `#e2e8f0` | `<MiniMap>` node rectangles (per-node `nodeColor` prop wins) |
| `--pyreon-flow-minimap-mask` | `rgba(0, 0, 0, 0.08)` | `<MiniMap>` outside-viewport mask (`maskColor` prop wins) |

Rows marked `flowStyles` live in the optional injected stylesheet (below); everything else is inline on the elements, so the variables work with **no stylesheet injection at all**. Per-element props (`node.style`, `edge.style`, `nodeColor`, `maskColor`, `color` on `<Background>`) always override the theme variables.

:::note
SVG strokes/fills are set via the `style` attribute, never SVG presentation attributes — `var()` is invalid in a presentation attribute (the value would be dropped and the shape would render invisible). Follow the same rule in custom edge renderers.
:::

### `flowStyles` — hover & animation states

Inline styles can't express `:hover` / `@keyframes`, so those polish states ship as an exported CSS string. Inject it once at app root:

```tsx
import { flowStyles } from '@pyreon/flow'

const style = document.createElement('style')
style.textContent = flowStyles
document.head.appendChild(style)
```

It provides: the `animated` edge dash animation, node drag/selected shadows, handle + resizer hover scaling and colors, `<Controls>` button hover/active backgrounds, minimap hover opacity, and the toolbar enter animation. Everything renders fine without it — the graph just loses those hover/animation flourishes.

## Edge Path Utilities

Pure functions for generating SVG edge paths. Each takes a params object and returns an `EdgePathResult` **object** — `{ path, labelX, labelY }`.

```tsx
import { getBezierPath, getSmoothStepPath, getStraightPath, getStepPath } from '@pyreon/flow'

const { path, labelX, labelY } = getBezierPath({
  sourceX: 0,
  sourceY: 0,
  sourcePosition: Position.Right,
  targetX: 200,
  targetY: 100,
  targetPosition: Position.Left,
})
```

:::warning
These helpers return an **object** `{ path, labelX, labelY }`, not a tuple. Destructure by name (`const { path } = getBezierPath(...)`), not by position.
:::

| Helper                     | Signature (params → result)                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `getBezierPath`            | `{ sourceX, sourceY, sourcePosition?, targetX, targetY, targetPosition?, curvature? }` → `EdgePathResult` |
| `getSmoothStepPath`        | `{ sourceX, sourceY, sourcePosition?, targetX, targetY, targetPosition?, borderRadius?, offset? }` → `EdgePathResult` |
| `getStepPath`              | `{ sourceX, sourceY, sourcePosition?, targetX, targetY, targetPosition? }` → `EdgePathResult` (smoothstep, `borderRadius: 0`) |
| `getStraightPath`          | `{ sourceX, sourceY, targetX, targetY }` → `EdgePathResult`                                  |
| `getWaypointPath`          | `{ sourceX, sourceY, targetX, targetY, waypoints }` → `EdgePathResult`                       |
| `getEdgePath`              | `(type, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, pathOptions?)` → `EdgePathResult` (dispatches by type, threads [`pathOptions`](#per-edge-path-options)) |
| `getHandlePosition`        | `(position, nodeX, nodeY, nodeWidth, nodeHeight, handleId?)` → `XYPosition`                  |
| `getSmartHandlePositions`  | `(sourceNode, targetNode, dims?)` → `{ sourcePosition, targetPosition }` (auto-picks nearest edges) |
| `getFloatingEndpoints`     | `(sourceNode, targetNode, dims)` → `{ source, target }` perimeter points + sides (the natural-angle [floating endpoints](#edge-anchoring--node-measurement)) |
| `getNodeIntersection`      | `(box, toward)` → `XYPosition` where the ray from `box` center toward a point exits the box perimeter |
| `resolveHandleAnchor`      | `(node, handleId, type, dims, measurement?)` → `{ x, y, position } \| null` ([handle-anchor priority chain](#edge-anchoring--node-measurement)) |
| `getEffectiveDimensions`   | `(node, measurement?)` → `Dimensions` (explicit → measured → `DEFAULT_NODE_WIDTH`×`DEFAULT_NODE_HEIGHT`) |

### Marker Helpers

Low-level helpers for working with edge markers (also pure + exported):

| Helper               | Signature                                                          | Description                                  |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `resolveMarker`      | `(spec) => EdgeMarker \| null`                                     | Normalize a bare `MarkerType` / object / `null` to a fully-defaulted marker |
| `markerId`           | `(marker) => string`                                               | Deterministic DOM-safe `<defs>` id for a marker (identical configs collapse) |
| `resolveEdgeMarkers` | `(edge, defaultMarkerEnd) => { start, end }`                       | Resolve an edge's start/end markers, applying the flow default end |
| `collectEdgeMarkers` | `(edges, defaultMarkerEnd) => Map<string, EdgeMarker>`             | Every distinct marker across all edges (the deduped `<defs>` set) |
| `DEFAULT_MARKER_END` | `EdgeMarker`                                                       | The built-in default `{ type: MarkerType.ArrowClosed }` |

## Position Enum

```tsx
import { Position } from '@pyreon/flow'

Position.Top    // 'top'
Position.Right  // 'right'
Position.Bottom // 'bottom'
Position.Left   // 'left'
```

## Cleanup

```tsx
flow.dispose() // cancel in-flight animations + clear all listeners
```

`useFlow` calls this automatically on unmount. For a `createFlow` instance owned outside a component tree, call it yourself at the right lifecycle point.

## API Reference

### Core functions

| Function                            | Signature                                                                       | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `createFlow<TData>(config?)`        | `(config?: FlowConfig<TData>) => FlowInstance<TData>`                           | Create a reactive flow instance                              |
| `useFlow<TData>(config)`            | `(config: FlowConfig<TData>) => FlowInstance<TData>`                           | `createFlow` + auto-dispose on unmount (component-scoped)    |
| `computeLayout<TData>(...)`         | `(nodes, edges, algorithm?, options?) => Promise<Array<{ id, position }>>`      | Standalone elkjs layout (lazy-loaded); doesn't mutate a flow |

### `FlowInstance` — state

| Member          | Type                                  | Description                                |
| --------------- | ------------------------------------- | ------------------------------------------ |
| `nodes`         | `Signal<FlowNode<TData>[]>`           | All nodes (reactive)                       |
| `edges`         | `Signal<FlowEdge[]>`                  | All edges (reactive)                       |
| `viewport`      | `Signal<Viewport>`                    | `{ x, y, zoom }` (reactive)                |
| `containerSize` | `Signal<{ width, height }>`           | Set by `<Flow>` via ResizeObserver         |
| `zoom`          | `Computed<number>`                    | Current zoom level                         |
| `selectedNodes` | `Computed<string[]>`                  | Selected node **ids**                      |
| `selectedEdges` | `Computed<string[]>`                  | Selected edge **ids**                      |
| `nodeMap`       | `Computed<Map<string, FlowNode>>`     | O(1) node lookup (rebuilt per `nodes()` change) |
| `edgeMap`       | `Computed<Map<string, FlowEdge>>`     | O(1) edge lookup (rebuilt per `edges()` change) |
| `measurements`  | `Signal<Map<string, NodeMeasurement>>` | Measured node boxes + `<Handle>` dot centers (see [Edge Anchoring](#edge-anchoring--node-measurement)) |
| `config`        | `FlowConfig<TData>`                   | The config the flow was created with       |

### `FlowInstance` — methods

| Method                                            | Returns                              | Description                                  |
| ------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `getNode(id)` / `getEdge(id)`                     | `FlowNode \| undefined` / `FlowEdge \| undefined` | Lookup by id                      |
| `addNode(node)` / `addEdge(edge)`                 | `void`                               | Add (edge id auto-generated if absent; dupes skipped) |
| `removeNode(id)` / `removeEdge(id)`               | `void`                               | Remove (removeNode also removes its edges)   |
| `updateNode(id, partial)`                         | `void`                               | Shallow-merge properties onto a node         |
| `updateNodePosition(id, pos)`                     | `void`                               | Move a node (respects snap + extent)         |
| `reconnectEdge(id, { source?, target?, ... })`    | `void`                               | Reconnect an edge's endpoints/handles        |
| `addEdgeWaypoint` / `updateEdgeWaypoint` / `removeEdgeWaypoint` | `void`                  | Edge bend-point ops                          |
| `isValidConnection(connection)`                   | `boolean`                            | Check against `connectionRules`              |
| `selectNode(id, additive?)` / `selectEdge(id, additive?)` | `void`                       | Select (positional `additive` boolean)       |
| `deselectNode(id)` / `clearSelection()` / `selectAll()` | `void`                         | Selection ops                                |
| `deleteSelected()` / `moveSelectedNodes(dx, dy)`  | `void`                               | Operate on the current selection             |
| `fitView(ids?, padding?)`                         | `void`                               | Fit all (or given) nodes                     |
| `zoomTo(z)` / `zoomIn()` / `zoomOut()`            | `void`                               | Zoom (clamped to min/max)                    |
| `panTo(pos)` / `focusNode(id, zoom?)` / `animateViewport(target, ms?)` | `void`         | Move the viewport                            |
| `isNodeVisible(id)`                               | `boolean`                            | Is the node within the viewport              |
| `getNodeDimensions(id)`                           | `Dimensions`                         | Effective node box: explicit → measured → 150×40 (`{0,0}` for unknown id) |
| `layout(algorithm?, options?)`                    | `Promise<void>`                      | Auto-layout via elkjs                        |
| `batch(fn)`                                       | `void`                               | Coalesce mutations into one notification     |
| `getConnectedEdges(id)`                           | `FlowEdge[]`                         | Edges touching a node                        |
| `getIncomers(id)` / `getOutgoers(id)`             | `FlowNode[]`                         | Upstream / downstream nodes                  |
| `getChildNodes(id)` / `getAbsolutePosition(id)`   | `FlowNode[]` / `XYPosition`          | Group/sub-flow helpers (cycle-safe)          |
| `findNodes(pred)` / `searchNodes(query)`          | `FlowNode[]`                         | Filter by predicate / by `data.label` text   |
| `getProximityConnection(id, threshold?)`          | `Connection \| null`                 | Nearest valid unconnected node               |
| `getOverlappingNodes(id)` / `resolveCollisions(id, spacing?)` | `FlowNode[]` / `void`    | Collision detection / resolution             |
| `setNodeExtent(extent)` / `clampToExtent(pos, w?, h?)` | `void` / `XYPosition`           | Drag boundaries                              |
| `copySelected()` / `paste(offset?)`               | `void`                               | Clipboard ops                                |
| `pushHistory()` / `undo()` / `redo()`             | `void`                               | Manual undo/redo (50-snapshot cap)           |
| `getSnapLines(id, pos, threshold?)`               | `{ x, y, snappedPosition }`          | Helper-line snap targets for a dragged node  |
| `toJSON()` / `fromJSON(data)`                     | `{ nodes, edges, viewport }` / `void` | Serialize / restore                         |
| `onConnect` / `onNodesChange` / `onNodeClick` / `onEdgeClick` / `onNodeDragStart` / `onNodeDragEnd` / `onNodeDoubleClick` | `() => void` | Subscribe; returns unsubscribe |
| `dispose()`                                       | `void`                               | Cancel animations + clear listeners          |

### Components

| Component       | Key props                                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| `<Flow>`        | `instance` (required), `nodeTypes?`, `edgeTypes?`, `style?`, `class?`, `children?` |
| `<Background>`  | `variant?` (`'dots'`/`'lines'`/`'cross'`), `gap?`, `size?`, `color?`               |
| `<MiniMap>`     | `nodeColor?`, `maskColor?`, `width?`, `height?`, `style?`, `class?`                |
| `<Controls>`    | `showZoomIn?`, `showZoomOut?`, `showFitView?`, `showLock?`, `position?`            |
| `<Panel>`       | `position?`, `style?`, `class?`, `children`                                        |
| `<Handle>`      | `type` (`'source'`/`'target'`), `position` (`Position`), `id?`, `style?`, `class?` |
| `<NodeResizer>` | `nodeId` (required), `instance` (required), `minWidth?`, `minHeight?`, `handleSize?`, `showEdgeHandles?` |
| `<NodeToolbar>` | `position?` (`'top'`/`'bottom'`/`'left'`/`'right'`), `offset?`, `showOnSelect?`, `selected?`, `style?`, `class?`, `children` |

### `NodeComponentProps<TData>` (custom node renderers)

| Prop       | Type            | Notes                                            |
| ---------- | --------------- | ------------------------------------------------ |
| `id`       | `string`        | Stable identity — plain value, never changes     |
| `data`     | `() => TData`   | Reactive accessor — read inside a reactive scope |
| `selected` | `() => boolean` | Reactive accessor                                |
| `dragging` | `() => boolean` | Reactive accessor                                |

## Comparison with React Flow

| Feature                | React Flow                   | @pyreon/flow                  |
| ---------------------- | ---------------------------- | ----------------------------- |
| Update 1 of 1000 nodes | New array → diff all         | 1 signal → 1 DOM update       |
| Node re-render on drag | Re-render of affected nodes  | Patch in place — node mounts once |
| Dependencies           | React + D3                   | No D3; elkjs lazy-loaded on first `layout()` |
| State management       | 3 callbacks + `applyChanges` | Automatic — zero boilerplate  |
| Auto-layout            | Separate elkjs setup         | `flow.layout('layered')`      |
| Undo/redo              | DIY                          | Built-in (manual `pushHistory`) |
| Connection rules       | `isValidConnection` callback | Declarative config            |
