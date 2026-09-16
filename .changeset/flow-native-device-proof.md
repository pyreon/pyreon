---
'@pyreon/flow': minor
'@pyreon/native-compiler': minor
---

Expose Flow canvas labels to native accessibility APIs and add direct SwiftUI
and Compose device coverage for custom nodes, handles, resizing, edges,
backgrounds, and controls.

Measure intrinsic custom-node content in both native hosts so edge routing,
handles, hit targets, and node positioning use the rendered dimensions while
preserving explicit width and height precedence.

Match the web editor's hardware-keyboard model on SwiftUI and Compose: focused
nodes select with Enter/Space, move by 10 units with arrows (100 with Shift),
and the canvas handles configured deletion, Escape, select/copy/paste, and
undo/redo shortcuts.

Lower the reactive `nodeMap`, `edgeMap`, and `measurements` FlowInstance reads
to native lookup maps, including shared `size`, `get`, and `has` operations.
