---
'@pyreon/flow': minor
---

React Flow API parity for the imperative surface.

- Batch mutations: `getNodes`/`addNodes`/`setNodes`/`removeNodes`/
  `updateNodeData`, `getEdges`/`addEdges`/`setEdges`/`removeEdges`/`updateEdge`.
- Viewport: `getViewport`, `setViewport(partial, { duration })`, `setCenter`,
  `zoomTo`/`zoomIn`/`zoomOut`/`fitView` accept `{ duration }`,
  `screenToFlowPosition` / `flowToScreenPosition` (the mounted canvas
  registers its rect); a plain write cancels an in-flight animation.
- `hidden` and `deletable` on nodes and edges, `nodesDeletable` /
  `edgesDeletable` defaults.
- `isValidConnection` config veto and `connectionRadius` drop snapping.
- Automatic undo checkpoints on every structural mutation (`autoHistory`,
  default on; deduped against manual `pushHistory()`).
- Listeners: `onEdgesChange`, `onSelectionChange`, `onViewportChange`,
  `onNodesDelete`, `onEdgesDelete`, `onNodeDrag` (per frame),
  `onConnectStart`/`onConnectEnd`, `onPaneClick`.
