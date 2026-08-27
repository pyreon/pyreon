---
"@pyreon/state-tree": patch
---

perf: O(depth) `reference()` resolution via a validated identifier index

`reference()` resolution ran a full O(N) depth-first walk of the tree on EVERY
read — so R reference-reading rows over an N-node tree were O(R·N) per render,
the one genuinely super-linear path in the package.

`resolveIdentifier` now consults a lazy identifier index (definition → id →
node) before walking: the first resolve for an id walks the tree and warms the
cache, subsequent resolves are O(depth) validated hits.

The index is **pure acceleration, never a correctness authority.** Every hit is
re-validated against the live tree — node still alive, of the right definition,
its id still equals the queried id, and still attached under the query root —
and any validation miss falls back to the authoritative DFS. So a stale or wrong
entry can only ever cost one extra walk, never a wrong resolution. Attachment is
verified through the `children` graph (which the container reconciler keeps
accurate on detach), NOT `getRoot` (whose `parent` pointer is not cleared on an
array splice). Nodes are held via `WeakRef`, so a detached-and-dropped node
stays GC-eligible (no unbounded-growth leak). No lifecycle hooks: id-change,
detach, destroy, re-parent and GC are all handled by validation + fallback.

Bisect-verified: disabling the fast path makes a repeated resolve redo the full
walk; stubbing the attachment check to a `getRoot`-style test resolves a detached
node the DFS would not — both fail their specs.

The dead-`WeakRef` prune in the index now has a test, and a `_indexEntryCount`
probe to make it observable. It needed one: the prune does not change what
`indexLookup` returns — a dead ref falls through to the `meta === undefined`
exit and yields `undefined` either way — so its only job is keeping the map from
growing one dead entry per collected node, and nothing was watching that.
