---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Lower the public Flow node-anchoring helpers to the native SwiftUI and Compose runtimes.

`getFloatingEndpoints`, `getSmartHandlePositions`, and `resolveHandleAnchor` now preserve web-compatible dimensions, configured-handle precedence, perimeter intersections, tangent sides, and result field names in shared-source native builds.

Static `<Handle>` declarations inside literal `nodeTypes` renderers now become real interactive SwiftUI and Compose connection handles, including side offsets. Explicit per-node handle arrays continue to win for their endpoint type.
