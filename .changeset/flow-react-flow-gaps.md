---
'@pyreon/flow': minor
'@pyreon/native-compiler': minor
---

Close the remaining React Flow gaps on web, iOS and Android.

- `getIntersectingNodes`, `isNodeIntersecting` and `getNodesBounds` on the flow instance.
- `connectionMode: 'strict' | 'loose'`. Under the default `'strict'`, a connection may start from either handle type and drops only on the opposite type; starting from a target handle builds the edge from source to target. Check any drop logic that assumed a drag always starts from a source handle. `'loose'` connects any handle to any other.
- `zIndex` on nodes and edges, plus `elevateNodesOnSelect` (default `true`) and `elevateEdgesOnSelect` (default `false`). **Behaviour change:** a selected node now draws above the nodes around it.
- The context-menu listeners (`onNodeContextMenu`, `onEdgeContextMenu`, `onPaneContextMenu`) and the hover listeners (`onNodeMouseEnter` / `Leave`, `onEdgeMouseEnter` / `Leave`). While a context-menu listener is registered, the browser's own menu is suppressed for that target. On iOS and Android the context menu opens on a long-press, and hover needs a pointer.
- Auto-pan while a node or a connection is dragged near the canvas edge: `autoPanOnNodeDrag`, `autoPanOnConnect` and `autoPanSpeed`. **Behaviour change:** it is on by default.
- The `<BaseEdge>`, `<EdgeText>` and `<ViewportPortal>` components, and the `EdgeComponentProps` type is now exported. `<BaseEdge>` and `<EdgeText>` lower natively. `<ViewportPortal>` is web-only; the compiler names it and drops it.
