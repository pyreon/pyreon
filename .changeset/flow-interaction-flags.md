---
'@pyreon/flow': minor
---

feat(flow): honor the `selectable` / `nodesSelectable` / `connectable` / `nodesConnectable` interaction flags + the `node.group` marker. These were declared in `FlowNode` / `FlowConfig` but never read — `nodesSelectable: false` / `node.selectable: false` now gate user click-selection (programmatic `selectNode` is unaffected), `nodesConnectable: false` / `node.connectable: false` gate connection drawing, and `node.group: true` adds a `group` class to the node element for styling. All mirror the existing `draggable` / `nodesDraggable` guard pattern.
