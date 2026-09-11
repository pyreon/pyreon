---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Preserve Flow node and edge interaction metadata when `createFlow` crosses to Swift and Kotlin.

Native `PyreonFlowNode` now carries per-node draggable, selectable, connectable, focusable, accessibility, visibility, deletion, and group-parent fields. `PyreonFlowEdge` now carries source/target handles plus focusable, accessibility, visibility, deletion, reconnection, and interaction-width fields. Declaration-time seeds and `addNode`/`addEdge` literals emit those fields on both targets instead of silently discarding them; unsupported fields remain named warnings.

Swift compiler validation now uses a disposable module cache, keeping hermetic and sandboxed runs independent of a writable user-level Clang cache.
