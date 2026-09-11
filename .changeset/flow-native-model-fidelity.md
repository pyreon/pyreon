---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Preserve Flow node and edge interaction metadata when `createFlow` crosses to Swift and Kotlin.

Native `PyreonFlowNode` now carries per-node draggable, selectable, connectable, focusable, accessibility, visibility, deletion, and group-parent fields. `PyreonFlowEdge` now carries source/target handles plus focusable, accessibility, visibility, deletion, reconnection, and interaction-width fields. Declaration-time seeds and `addNode`/`addEdge` literals emit those fields on both targets instead of silently discarding them; unsupported fields remain named warnings.

The native state also gains bulk node/edge removal and selection, plain state reads, multi-node movement, coordinate conversion, viewport visibility, group-child/absolute-position queries, and node focusing. Shared-source calls lower with the Swift labels, named position types, and Kotlin numeric widening each platform requires.

Edge waypoints now survive declaration and `addEdge` lowering, and native state supports waypoint insertion, update, removal, and edge reconnection with web-compatible index behavior.

Partial viewport updates and center-on-coordinate operations now lower to equivalent native state operations.

Swift compiler validation now uses a disposable module cache, keeping hermetic and sandboxed runs independent of a writable user-level Clang cache.
