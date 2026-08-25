---
'@pyreon/flow': minor
---

Pointer-path performance overhaul (P4–P8 of the fundamentals perf campaign). Measured in happy-dom at the stated sizes:

- **History snapshots are shallow array copies** instead of `structuredClone` — `pushHistory` (it runs inside node-grab pointerdown) drops from ~1.13ms to ~0.002ms per call at 1000 nodes / 1000 edges, and undo/redo now work with non-cloneable node `data` (a function-valued callback previously threw `DataCloneError`). Safe because every write path replaces changed node/edge objects immutably — the same invariant the per-id equality gates already rely on. In-place mutation of node objects remains unsupported (it never rendered); undo cannot restore such mutations, and effectively could not before either.
- **Object snapping precomputes candidate guide lines once per drag** (`_createSnapSession`, internal; `SnapSession` type exported) instead of an O(N) scan with N allocations on every pointermove. Behavior change for MULTI-node drags: co-dragged nodes are no longer snap candidates — they move rigidly with the pointer, so snapping against them produced oscillating feedback.
- **Selection is per-id gated.** New `isNodeSelected(id)` / `isEdgeSelected(id)` reactive O(1) membership reads backed by per-id `{ equals: Object.is }` computeds — a selection change re-runs O(changed) node thunks instead of all N (20 selection changes at 300 mounted nodes: ~210ms → ~9ms; the old `selectedNodes().includes(id)` per-thunk scan was O(N²)). New bulk `selectNodes(ids, additive?)` replaces the rubber-band commit's O(K²) additive loop (300-node band: ~3000ms → ~0.3ms).
- **MiniMap patches in place** (static mount, keyed rows, reactive attr thunks) — a pan/zoom frame creates ZERO elements (was ~306 element creations per viewport write at 300 nodes; a 60-frame burst: ~302ms → ~2ms).
- **ONE shared ResizeObserver** measures all node wrappers (was one observer per node: 301 → 2 at 300 nodes).
- **Rubber-band / connection pointermoves reuse the container rect** captured at gesture start (was a forced-layout `getBoundingClientRect` per move; invalidated on container resize).
- **A drag frame is one batched reactive drain**, and helper-line writes are value-gated (unchanged guides write nothing — ~2 signal writes/frame → 1).
- **Selection box, helper-line guides, and Controls patch in place**; Controls buttons no longer remount on zoom changes (the zoom % moved into an inner text thunk — pan already stopped remounting when the reactivity default value gate landed).

Honest non-mover: total drag-frame wall clock at 300 nodes / 300 edges stayed ~0.3ms/frame in happy-dom — that path is dominated by the keyed reconcile + per-id refresh machinery, not by the removed work. The wins above are eliminated allocations, forced-layout reads, observers and remounts, plus grab latency, selection, and rubber-band costs.
