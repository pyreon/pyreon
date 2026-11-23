---
'@pyreon/loom': minor
---

`internal-range` owns every edge to a workspace member, peers included, so an internal peer edge is reported once. A bare peer range that also misses the workspace copy's major is one `internal-range` error whose message names the mismatch. The `peer-mismatch` code is retired: it could only ever fire on an edge `internal-range` had already reported. `detectPeerMismatch` is removed from `@pyreon/loom`'s core exports, and a `loom.severity` override naming `peer-mismatch` is now rejected as an unknown code.

Upgrade: manual — remove any `peer-mismatch` key from a `loom.severity` override (an `internal-range` override now covers that edge) and stop importing `detectPeerMismatch`.
