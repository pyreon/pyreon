---
"@pyreon/flow": patch
---

perf: O(n) layout position application (was O(n²))

Applying a computed layout to the nodes ran `positions.find((p) => p.id ===
node.id)` inside `nds.map(...)` — O(nodes²), which shows up on large graphs after
every layout run. The *animated* branch already indexed positions into a `Map`
and used `.get(node.id)`; the non-animated branch just never got the same
treatment.

Index `positions` by id once (O(n)) and look each node up in O(1). Behaviour
identical. Bisect-verified: with the old `find` form the position application
calls `Array.prototype.find` once per node (N); the indexed form calls it 0.
