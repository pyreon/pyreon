---
title: Flow
description: Reactive flow diagrams for Pyreon — signal-native nodes, edges, pan/zoom, auto-layout via elkjs.
---

`@pyreon/flow` provides reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom without D3, auto-layout via elkjs, and per-node O(1) reactivity. Built from the ground up for signal-based frameworks.

<PackageBadge name="@pyreon/flow" href="/docs/flow" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/flow
```

```bash [bun]
bun add @pyreon/flow
```

```bash [pnpm]
pnpm add @pyreon/flow
```

```bash [yarn]
yarn add @pyreon/flow
```

:::

## Quick Start

```tsx
import { createFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'

const flow = createFlow({
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
    <Flow instance={flow} fitView>
      <Background />
      <MiniMap />
      <Controls />
    </Flow>
  )
}
```

No callbacks, no `applyNodeChanges`. The flow instance manages everything.

## Creating a Flow

`createFlow()` accepts a config object and returns a reactive `FlowInstance`:

```tsx
const flow = createFlow({
  nodes: [...],
  edges: [...],
  snapToGrid: true,
  snapGrid: 20,
  connectionRules: { ... },
  nodeExtent: { x: [0, 1000], y: [0, 800] },
})
```

### Config Options

| Option            | Type                                         | Default | Description                              |
| ----------------- | -------------------------------------------- | ------- | ---------------------------------------- |
| `nodes`           | `FlowNode[]`                                 | `[]`    | Initial nodes                            |
| `edges`           | `FlowEdge[]`                                 | `[]`    | Initial edges                            |
| `snapToGrid`      | `boolean`                                    | `false` | Snap node positions to grid              |
| `snapGrid`        | `number`                                     | `20`    | Grid size in pixels                      |
| `connectionRules` | `Record<string, ConnectionRule>`             | —       | Connection validation rules by node type |
| `nodeExtent`      | `&#123; x: [min, max], y: [min, max] &#125;` | —       | Constrain node positions within bounds   |
| `minZoom`         | `number`                                     | `0.1`   | Minimum zoom level                       |
| `maxZoom`         | `number`                                     | `4`     | Maximum zoom level                       |

## Reactive Signals

All state is exposed as reactive signals:

```tsx
flow.nodes() // Signal<FlowNode[]>
flow.edges() // Signal<FlowEdge[]>
flow.viewport() // Signal<Viewport> — { x, y, zoom }
flow.zoom() // Computed<number> — just the zoom level
flow.selectedNodes() // Computed<FlowNode[]>
flow.selectedEdges() // Computed<FlowEdge[]>
```

## Node Operations

```tsx
// Add a node
flow.addNode({
  id: '4',
  position: { x: 300, y: 200 },
  data: { label: 'New Node' },
})

// Remove a node (also removes connected edges)
flow.removeNode('4')

// Update node properties
flow.updateNode('2', { data: { label: 'Updated' } })

// Update position (respects snapToGrid and nodeExtent)
flow.updateNodePosition('2', { x: 250, y: 150 })

// Get a specific node
const node = flow.getNode('2') // FlowNode | undefined
```

## Edge Operations

```tsx
// Add an edge (id auto-generated if not provided)
flow.addEdge({ source: '1', target: '3' })

// Add with type
flow.addEdge({ source: '1', target: '3', type: 'smoothstep', label: 'yes' })

// Remove an edge
flow.removeEdge('e1-3')

// Get a specific edge
const edge = flow.getEdge('e1-3')

// Duplicate edges are prevented automatically
```

### Edge Types

Four built-in edge path algorithms:

| Type         | Description                           |
| ------------ | ------------------------------------- |
| `bezier`     | Smooth cubic bezier curve (default)   |
| `smoothstep` | Right-angle path with rounded corners |
| `step`       | Right-angle path with sharp corners   |
| `straight`   | Direct line between nodes             |

### Edge Waypoints

Add bend points to edges:

```tsx
flow.addEdgeWaypoint('e1-2', { x: 150, y: 50 })
flow.addEdgeWaypoint('e1-2', { x: 200, y: 75 }, 1) // at specific index
flow.updateEdgeWaypoint('e1-2', 0, { x: 160, y: 60 })
flow.removeEdgeWaypoint('e1-2', 0)
```

## Selection

```tsx
flow.selectNode('1') // select a node
flow.selectNode('2', { additive: true }) // add to selection
flow.selectEdge('e1-2') // select an edge
flow.selectAll() // select all nodes
flow.clearSelection() // deselect everything
flow.deleteSelected() // remove selected nodes and edges
flow.deselectNode('1') // remove from selection
```

## Viewport

```tsx
flow.zoomIn() // zoom in by 0.2
flow.zoomOut() // zoom out by 0.2
flow.zoomTo(1.5) // set exact zoom (clamped to min/max)
flow.fitView() // fit all nodes in viewport
flow.fitView(['1', '2']) // fit specific nodes
flow.panTo({ x: 100, y: 200 }) // pan to position

// Reactive zoom level
flow.zoom() // Computed<number>

// Check if a node is visible
flow.isNodeVisible('1') // boolean
```

## Auto-Layout

Layout nodes automatically using elkjs (lazy-loaded — zero cost until called):

```tsx
// Layered layout (DAG/pipeline)
await flow.layout('layered', { direction: 'RIGHT', spacing: 50 })

// Tree layout
await flow.layout('tree', { direction: 'DOWN', spacing: 40 })

// Force-directed
await flow.layout('force')

// Available algorithms
await flow.layout('stress')
await flow.layout('radial')
await flow.layout('box')
```

### Layout Options

| Option         | Type                                  | Default   | Description            |
| -------------- | ------------------------------------- | --------- | ---------------------- |
| `direction`    | `'DOWN' \| 'RIGHT' \| 'UP' \| 'LEFT'` | `'DOWN'`  | Layout direction       |
| `spacing`      | `number`                              | `50`      | Spacing between nodes  |
| `layerSpacing` | `number`                              | `spacing` | Spacing between layers |

elkjs is loaded on demand — only imported when `flow.layout()` is first called.

## Connection Rules

Define type-safe rules for which node types can connect:

```tsx
const flow = createFlow({
  nodes: [...],
  edges: [...],
  connectionRules: {
    input: { allowedTargets: ['process'] },
    process: { allowedTargets: ['process', 'output'] },
    output: { allowedTargets: [] },
  },
})

// Check if a connection is valid
flow.isValidConnection({ source: '1', target: '2' })  // boolean
```

## Graph Queries

```tsx
// Get all edges connected to a node
flow.getConnectedEdges('2') // FlowEdge[]

// Get upstream nodes (nodes with edges pointing to this node)
flow.getIncomers('2') // FlowNode[]

// Get downstream nodes (nodes this node points to)
flow.getOutgoers('2') // FlowNode[]
```

## Search and Filter

```tsx
// Find nodes by predicate
flow.findNodes((n) => n.type === 'process') // FlowNode[]

// Search by label text (case-insensitive)
flow.searchNodes('start') // FlowNode[]
```

## Undo / Redo

```tsx
flow.undo() // restore previous state
flow.redo() // restore undone state
```

## Copy / Paste

```tsx
flow.copy() // copy selected nodes to clipboard
flow.paste() // paste with offset, new IDs generated
```

## Collision Detection

```tsx
// Find nodes overlapping with a given node
flow.getOverlappingNodes('2') // FlowNode[]

// Resolve collisions — push overlapping nodes apart
flow.resolveCollisions('2')
```

## Proximity Connect

```tsx
// Find nearest unconnected node within distance
flow.findNearestNode('1', 200) // FlowNode | null
```

## Serialization

```tsx
// Export flow state as JSON
const json = flow.toJSON()
// { nodes: [...], edges: [...], viewport: { x, y, zoom } }

// Import flow state
flow.fromJSON(json)
flow.fromJSON(json, { resetViewport: true })
```

## Listeners

```tsx
// Connection created
flow.onConnect((edge) => {
  console.log('Connected:', edge.source, '→', edge.target)
})

// Node changes (position, add, remove)
flow.onNodesChange((change) => {
  console.log(change.type, change.id)
})

// Click handlers
flow.onNodeClick((nodeId) => { ... })
flow.onEdgeClick((edgeId) => { ... })

// All return unsubscribe functions
const unsub = flow.onConnect(...)
unsub()
```

## Batch Operations

```tsx
flow.batch(() => {
  flow.addNode({ id: '10', position: { x: 0, y: 0 }, data: { label: 'A' } })
  flow.addNode({ id: '11', position: { x: 200, y: 0 }, data: { label: 'B' } })
  flow.addEdge({ source: '10', target: '11' })
})
// Single signal notification for all changes
```

## Components

### `<Flow>`

The main container component:

```tsx
<Flow instance={flow} fitView style="width: 100%; height: 600px;">
  <Background />
  <MiniMap />
  <Controls />
</Flow>
```

### `<Background>`

Decorative background pattern:

```tsx
<Background variant="dots" gap={20} size={1} />
<Background variant="lines" gap={20} />
<Background variant="cross" gap={20} />
```

### `<MiniMap>`

Scaled overview with viewport indicator:

```tsx
<MiniMap
  nodeColor={(node) => (node.type === 'input' ? '#6366f1' : '#94a3b8')}
  maskColor="rgba(0,0,0,0.2)"
/>
```

### `<Controls>`

Zoom and fit controls:

```tsx
<Controls showFitView showZoomIn showZoomOut showLock />
```

### `<Handle>`

Connection points on nodes:

```tsx
import { Handle, Position } from '@pyreon/flow'

function CustomNode({ data }) {
  return (
    <div class="custom-node">
      <Handle type="target" position={Position.Left} />
      <span>{data.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

### `<Panel>`

Positioned overlay panels:

```tsx
<Panel position="top-left">
  <SearchBar />
</Panel>
<Panel position="bottom-right">
  <ZoomIndicator />
</Panel>
```

### `<NodeResizer>`

Drag handles for resizing nodes:

```tsx
<NodeResizer nodeId="1" minWidth={100} minHeight={50} />
```

### `<NodeToolbar>`

Floating toolbar that appears when a node is selected:

```tsx
<NodeToolbar nodeId="1" position={Position.Top}>
  <button>Edit</button>
  <button>Delete</button>
</NodeToolbar>
```

## Edge Path Utilities

Pure functions for generating SVG paths:

```tsx
import { getBezierPath, getSmoothStepPath, getStraightPath, getStepPath } from '@pyreon/flow'

const [path, labelX, labelY] = getBezierPath({
  sourceX: 0,
  sourceY: 0,
  targetX: 200,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
})
```

## Position Enum

```tsx
import { Position } from '@pyreon/flow'

Position.Top // 'top'
Position.Right // 'right'
Position.Bottom // 'bottom'
Position.Left // 'left'
```

## Cleanup

```tsx
flow.dispose() // remove all listeners, clear state
```

## Comparison with React Flow

| Feature                | React Flow                   | @pyreon/flow                 |
| ---------------------- | ---------------------------- | ---------------------------- |
| Update 1 of 1000 nodes | New array → diff all         | 1 signal → 1 DOM update      |
| Bundle size            | ~1.2MB (React + D3)          | ~50KB + elkjs on demand      |
| State management       | 3 callbacks + applyChanges   | Automatic — zero boilerplate |
| Auto-layout            | Separate elkjs setup         | `flow.layout('layered')`     |
| Undo/redo              | DIY                          | Built-in                     |
| Connection rules       | `isValidConnection` callback | Declarative config           |
