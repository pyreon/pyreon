# @pyreon/flow

Reactive flow diagrams for Pyreon. Signal-native nodes, edges, pan/zoom, and auto-layout via elkjs. No D3 dependency.

## Install

```bash
bun add @pyreon/flow
```

## Quick Start

```tsx
import { createFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'

const flow = createFlow({
  nodes: [
    { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
    { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
  ],
  edges: [{ source: '1', target: '2' }],
})

<Flow instance={flow}>
  <Background />
  <MiniMap />
  <Controls />
</Flow>
```

## API

### `createFlow(config)`

Create a reactive flow instance with signal-based state.

**Reactive state:** `flow.nodes`, `flow.edges`, `flow.viewport`

**Node operations:** `addNode()`, `removeNode()`, `updateNode()`, `updateNodePosition()`

**Edge operations:** `addEdge()`, `removeEdge()`

**Selection:** `selectNode()`, `selectEdge()`, `clearSelection()`, `deleteSelected()`

**Viewport:** `zoomIn()`, `zoomOut()`, `zoomTo()`, `fitView()`, `panTo()`

**Layout:** `flow.layout(algorithm, options)` — auto-layout via elkjs (lazy-loaded). Algorithms: layered, force, stress, tree, radial, box.

**Graph queries:** `getConnectedEdges()`, `getIncomers()`, `getOutgoers()`, `isValidConnection()`

**Listeners:** `onConnect()`, `onNodesChange()`, `onNodeClick()`, `onEdgeClick()`

### Components

| Component | Description |
| --- | --- |
| `<Flow>` | Main container with pan/zoom via pointer events + CSS transforms |
| `<Background>` | Dot or line grid background |
| `<MiniMap>` | Overview minimap |
| `<Controls>` | Zoom/fit buttons |
| `<Handle>` | Connection handle on nodes |
| `<Panel>` | Overlay panel positioned relative to the flow |
| `<NodeResizer>` | Resize handle for nodes |
| `<NodeToolbar>` | Toolbar attached to a node |

### Edge Paths

`getBezierPath()`, `getSmoothStepPath()`, `getStraightPath()`, `getStepPath()`, `getWaypointPath()`

### `Position`

Enum: `Top`, `Right`, `Bottom`, `Left`

## License

MIT
