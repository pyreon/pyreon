---
'@pyreon/flow': patch
---

Perf: a node measurement is an O(1) in-place write with a forced notify
instead of a copy of the whole measurements Map per node (a 1,000-node mount
copied ~500,000 entries before the first frame); `getNode` reads the id map
instead of scanning the node array on every drag frame.
