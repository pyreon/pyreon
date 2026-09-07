---
'@pyreon/flow': minor
---

`PyreonFlowState` (iOS + Android) — id-keyed storage, per-node observation, and three web-parity fixes.

**Performance (measured on the same harness before/after, Apple M3 Max, per-file `-O` = the build every device gate runs):** a single `updateNodePosition` no longer invalidates every node view — Swift went from 1000/1000 trackers fired per drag frame at N=1,000 to only the moved node's readers; the id lookup on the drag path went from an O(n) generic array scan (452 µs at N=10,000) to an O(1) hash on a non-generic key (5.3 µs); `getNode` 1035 → 1.0 µs; `isNodeSelected` 20 → 1.3 µs (selection is now an insertion-ordered list PAIRED with a set); a 10,000-view render pass 97 → 14 ms; `deleteSelected` 1533 → 647 µs. Android mirrors it on `mutableStateMapOf` (per-key snapshot state) + `mutableStateListOf` for order: `updateNodePosition` 40 → 0.02 µs, `getNode` 22.6 → 0.02 µs at N=10,000, and no N-reference list is allocated per pointer-move any more. `nodes` is now DERIVED (a read subscribes to every node — use `getNode(id)` in per-node views, it is the per-node subscription point).

**Parity fixes (each was a silent divergence from the web engine):** `selectAll` no longer clears the edge selection (web `selectAll` only replaces the node set); a seeded or added edge without a `type` now reads `"bezier"` (the web `normalizeEdge` default) instead of `nil`/`null`; Swift `containerSize` is a `PyreonFlowContainerSize` struct (the Kotlin spelling) instead of a tuple — hand-written SwiftUI hosts assign `PyreonFlowContainerSize(width:height:)`.

The Kotlin co-source verify gate gained a functional `SnapshotStateMap` stub so the Android behaviour test still RUNS.
