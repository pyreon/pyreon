---
'@pyreon/loom': minor
---

`internal-range` owns every edge to a workspace member, peers included, so an internal peer edge is reported once. A bare peer range that also misses the workspace copy's major is one `internal-range` error whose message names the mismatch; it carries `details.peerMajorMismatch: true` and stays at least a warning when `loom.severity` lowers `internal-range` to `info`. The `peer-mismatch` code is retired: it could only ever fire on an edge `internal-range` had already reported. `detectPeerMismatch` is removed from `@pyreon/loom`'s core exports, and a `loom.severity` key or `loom.ignore` entry naming `peer-mismatch` is rejected with a message that names `internal-range` as its replacement.

Upgrade: manual — rename any `peer-mismatch` key in `loom.severity` / `loom.ignore` to `internal-range` (or delete it) and stop importing `detectPeerMismatch`.
