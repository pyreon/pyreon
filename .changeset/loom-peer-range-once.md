---
'@pyreon/loom': patch
---

A bare (non-`workspace:`) peer range on a workspace member that also misses the workspace copy's major is reported once, as an `internal-range` error whose message names the major mismatch, instead of an `internal-range` error plus a `peer-mismatch` warning for the same edge.
