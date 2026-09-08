---
'@pyreon/flow': minor
---

Portaled overlay layers.

- `<EdgeLabelRenderer>` renders HTML edge labels for custom edges into a
  layer inside the viewport; `EdgeComponentProps` gains `labelX`/`labelY`.
- `<NodeToolbar nodeId>` is portaled into a container-level layer: it follows
  the node through pan/zoom without being scaled or clipped and sits above
  every node (`align` added). Without `nodeId` the inline form is unchanged.
- A pointerdown on a toolbar or a `.nopan` element never starts a canvas pan.
