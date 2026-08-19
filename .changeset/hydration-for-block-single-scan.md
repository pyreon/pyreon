---
'@pyreon/runtime-dom': minor
---

perf(hydration): parse a `<For>` block's rows in one pass instead of two

A hydrating `<For>` walked its block's sibling chain twice — once to find the
matching `<!--/pyreon-for-->`, then again to collect the `<!--k:KEY-->` row
markers — and then paid two more sibling reads per row (`.nextSibling` for the
row's first node, `.previousSibling` for its last) that the walk already had in
hand. Fused into one ordered pass that carries both, the per-row sibling-getter
budget drops from 6 to 2.

Measured on a 1000-row keyed table, counting the runtime's own reads of
`Node.prototype`'s traversal getters: the block parse falls 6000 → 2000, and
the whole hydration walk falls 19,047 → 15,047 DOM traversal reads (−21%).
Behaviour is unchanged — adoption, key verification, and the empty-row bail all
take the same decisions — so the reduction is in traversal work only. This is
an op-count result; the wall-clock effect is not measured here.
