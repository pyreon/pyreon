# @pyreon/flow

Reactive flow diagrams with signal-native nodes, edges, pan/zoom, and auto-layout via elkjs. No D3 dependency.

## Installation

```bash
bun add @pyreon/flow
```

## Usage

### Basic Flow

```tsx
import { createFlow, Flow, Background, MiniMap, Controls } from "@pyreon/flow"

const flow = createFlow({
  nodes: [
    { id: "1", position: { x: 0, y: 0 }, data: { label: "Start" } },
    { id: "2", position: { x: 200, y: 100 }, data: { label: "End" } },
  ],
  edges: [{ source: "1", target: "2" }],
})

<Flow instance={flow}>
  <Background />
  <MiniMap />
  <Controls />
</Flow>
```

### Node and Edge Operations

```ts
flow.addNode({ id: "3", position: { x: 100, y: 200 }, data: { label: "New" } })
flow.updateNode("3", { data: { label: "Updated" } })
flow.updateNodePosition("3", { x: 150, y: 250 })
flow.removeNode("3")

flow.addEdge({ source: "1", target: "3" })  // auto-generates id
flow.removeEdge("edge-id")
```

### Selection

```ts
flow.selectNode("1")
flow.selectEdge("edge-id")
flow.clearSelection()
flow.deleteSelected()
```

### Viewport Control

```ts
flow.zoomIn()
flow.zoomOut()
flow.zoomTo(1.5)
flow.fitView()
flow.panTo({ x: 100, y: 200 })
```

### Auto Layout

Layout via elkjs (lazy-loaded, zero cost until called):

```ts
await flow.layout("layered")       // top-to-bottom layered
await flow.layout("force")         // force-directed
await flow.layout("tree")          // tree layout
await flow.layout("radial")        // radial layout
```

Algorithms: `layered`, `force`, `stress`, `tree`, `radial`, `box`.

### Event Listeners

```ts
flow.onConnect((connection) => { /* handle new connection */ })
flow.onNodesChange((changes) => { /* node moved, resized, etc. */ })
flow.onNodeClick((node) => { /* node clicked */ })
flow.onEdgeClick((edge) => { /* edge clicked */ })
```

### Graph Queries

```ts
flow.getConnectedEdges("1")  // edges connected to node "1"
flow.getIncomers("2")        // nodes with edges pointing to "2"
flow.getOutgoers("1")        // nodes that "1" points to
flow.isValidConnection(connection)  // check connection rules
```

### Edge Paths

```ts
import { getBezierPath, getSmoothStepPath, getStraightPath, getStepPath } from "@pyreon/flow"
```

## Components

| Component | Description |
| --- | --- |
| `Flow` | Main container (`instance`, children) |
| `Background` | Dot or line grid background |
| `MiniMap` | Miniature overview map |
| `Controls` | Zoom/fit buttons |
| `Handle` | Connection handle on nodes |
| `Panel` | Overlay panel (positioned) |
| `NodeResizer` | Drag-to-resize handle for nodes |
| `NodeToolbar` | Floating toolbar for selected nodes |

## API Reference

| Export | Description |
| --- | --- |
| `createFlow(config)` | Create a reactive flow instance |
| `Position` | Enum: `Top`, `Right`, `Bottom`, `Left` |
| `computeLayout(nodes, edges, algorithm, options)` | Standalone layout computation |
| `flowStyles` | Default CSS styles for flow components |
| `getBezierPath` / `getSmoothStepPath` / `getStraightPath` / `getStepPath` | Edge path utilities |
| `getEdgePath` / `getHandlePosition` / `getSmartHandlePositions` / `getWaypointPath` | Advanced edge utilities |
