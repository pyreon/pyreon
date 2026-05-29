---
'@pyreon/flow': patch
---

perf(flow): O(1) node/edge accessors via `nodeMap`/`edgeMap` — removes the O(N²)-per-drag-frame cliff

A node drag writes the whole `nodes()` array every pointermove frame, which notifies every node + edge style/class/path thunk (they all subscribe to the one `nodes()` signal). Each thunk's accessor previously did an O(N) `instance.nodes().find()` (edges: 2× O(N) for source/target + O(E) for the edge) → **O(N²) + O(E×(2N+E)) per frame**, contradicting the documented "60fps drag in a 1000-node graph is O(1) per frame" contract.

`FlowInstance` now exposes `nodeMap` / `edgeMap` — `Computed<Map<id, entry>>` that rebuild once per `nodes()` / `edges()` change. The per-node/per-edge accessors use O(1) `Map.get`, so a drag frame is O(N) total (one map rebuild + N O(1) gets) instead of O(N²). Behavior is unchanged (329/329 existing flow tests pass). Bisect-verified: a 60-node/40-edge drag frame drops from 460 `Array.prototype.find` calls to ~0, and the count no longer scales with graph size (`drag-frame-complexity.test.ts`).
