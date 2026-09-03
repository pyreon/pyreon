---
'@pyreon/flow': patch
---

`PyreonFlowState.deleteSelected()` was quadratic on both native targets. It was built from the CRUD primitives — one `removeNode`/`removeEdge` call per selected id — and each `removeNode` re-scans the whole `nodes` AND `edges` collections, so K selected nodes cost O(K x (N + E)) rather than O(N + E). "Select all, then delete" is the shape that makes K = N: on a thousand-node graph that is roughly a million comparisons for one keypress instead of a couple of thousand.

The web engine this port is documented as byte-aligned with does not do that — its `deleteSelected` builds `Set`s from the selection once and does a single `filter` pass over each collection, with the edges predicate covering both concerns at once (connected-to-a-removed-node, and independently-edge-selected). Both native runtimes now use that same shape, including the reference's second branch for the edges-only case.

No behaviour change: the loop and the single-pass form produce identical node/edge/selection state, which is what the added specs pin.
