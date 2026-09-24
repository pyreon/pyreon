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

A complete native edge-path dispatcher now combines handle/floating endpoint resolution with waypoint and built-in route selection, matching authoritative web geometry fixtures.

SwiftUI and Compose now ship complete native Flow hosts that measure their container, render state-derived nodes and edges under one viewport, and support selection, node dragging, canvas pan/zoom, visibility, and accessibility labels. Real iOS and Android example targets compile the hosts, while the graph-to-stroke rules have executable Swift and Kotlin coverage.

Shared-source `<Flow instance={flow} />` now lowers directly to those SwiftUI and Compose hosts with a default node renderer. Unsupported custom renderer maps and optional web chrome remain explicit diagnostics rather than unresolved native symbols or silent drops.

Nested `<Background>` now lowers to native viewport-aware dots, lines, or cross patterns with matching gap, size, and color configuration.

Nested `<Controls>` now lowers to functional native zoom-in, zoom-out, fit-view, zoom-percentage, placement, and canvas-lock controls; locking disables pan, zoom, and node dragging on both targets.

Native MiniMap geometry now derives graph bounds, absolute child-node rectangles, scale, and the live viewport indicator identically on Swift and Kotlin, with executable coverage for hidden-node filtering.

Nested `<MiniMap>` now lowers to native node and viewport rendering with configurable size/colors, click-to-center, drag-to-pan, and pinch zoom behavior.

Literal `connectionRules` and `isValidConnection` callbacks now lower into both native state engines, preserving callback-first veto behavior and source-type-to-target-type validation.

Native connection commits now validate before mutation, preserve source/target handle IDs, generate stable unique IDs when needed, and reject duplicate explicit IDs; shared `isValidConnection({...})` calls lower to nominal native connection values.

Swift compiler validation now uses a disposable module cache, keeping hermetic and sandboxed runs independent of a writable user-level Clang cache.
