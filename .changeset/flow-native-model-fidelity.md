---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Preserve Flow node and edge interaction metadata when `createFlow` crosses to Swift and Kotlin.

Native `PyreonFlowNode` now carries per-node draggable, selectable, connectable, focusable, accessibility, visibility, deletion, and group-parent fields. `PyreonFlowEdge` now carries source/target handles plus focusable, accessibility, visibility, deletion, reconnection, and interaction-width fields. Declaration-time seeds and `addNode`/`addEdge` literals emit those fields on both targets instead of silently discarding them; unsupported fields remain named warnings.

The native state also gains bulk node/edge removal and selection, plain state reads, multi-node movement, coordinate conversion, viewport visibility, group-child/absolute-position queries, and node focusing. Shared-source calls lower with the Swift labels, named position types, and Kotlin numeric widening each platform requires.

Edge waypoints now survive declaration and `addEdge` lowering, and native state supports waypoint insertion, update, removal, and edge reconnection with web-compatible index behavior.

Partial viewport updates and center-on-coordinate operations now lower to equivalent native state operations.

Literal bulk node and edge additions/replacements now lower to native model arrays, retaining duplicate filtering, edge normalization, selection pruning, and removal of edges disconnected by node replacement.

Node extents now constrain native position updates and shared-source extent setup, clearing, and explicit clamping lower on both targets.

Literal `snapToGrid`, `snapGrid`, and `nodeExtent` configuration now initializes both native engines, including JavaScript-compatible rounding at negative half-grid positions.

Native edge rendering can now derive straight, bezier, and waypoint segment lists and label anchors directly from endpoint coordinates instead of requiring precomputed bridge payloads.

Native edge routing also covers every horizontal/vertical smooth-step orientation and zero-radius step paths.

Native geometry now resolves node-side handle midpoints, perimeter intersections, and floating endpoints with the same coordinates and tangent sides as web.

Configured and measured handles now resolve by ID with the web precedence rules, exact measured centers, effective node dimensions, and first-handle fallback.

Literal source/target handle declarations now survive `createFlow` seeds and `addNode`/bulk-node lowering on Swift and Kotlin.

Swift compiler validation now uses a disposable module cache, keeping hermetic and sandboxed runs independent of a writable user-level Clang cache.
