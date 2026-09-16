---
"@pyreon/flow": minor
---

`moveSelectedNodes` is now a positioned move on the web engine, exactly like `updateNodePosition` and the Swift/Kotlin engines: a nudge snaps to the grid when `snapToGrid` is on, clamps to the node extent, and reports every moved node through `onNodesChange`. Keyboard arrow nudges therefore land on the grid instead of one pixel step off it. `isNodeVisible` resolves a child node through its parent chain (the absolute position `fitView` and `focusNode` already used) instead of its parent-relative offset.

Both divergences were surfaced by the shared native-parity fixture, which now also covers grid and object snapping, `toJSON`/`fromJSON` round-trips, clipboard copy/paste, edge waypoints, `fitView`/`setCenter` against an explicit container size, `flowToScreenPosition`, absolute positions, child nodes, overlaps, proximity connections, search and collision resolution on web, iOS and Android.
