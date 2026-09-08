---
'@pyreon/flow': minor
---

React Flow structure parity.

- Sub-flows: a child (`parentId`) keeps a RELATIVE position and renders at
  the absolute one; parents carry their children on drag (no double move
  when both are selected); edges, `fitView`, `focusNode`, the selection box,
  culling and the minimap use absolute positions; parents render first.
  `extent: 'parent'` / a box extent clamp a dragged node; `expandParent`
  grows the parent.
- `<MiniMap>` pans on drag and zooms on wheel (`pannable` / `zoomable`).
- `<Controls>` accepts children.
- `<Flow colorMode="dark" | "system">` + a dark value for every
  `--pyreon-flow-*` variable in `flowStyles`.
