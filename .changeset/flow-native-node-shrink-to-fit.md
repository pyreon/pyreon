---
"@pyreon/flow": patch
---

Fixed on iOS: a flow node with no explicit `width` / `height` expanded to fill the whole canvas instead of sizing to its content. SwiftUI's `.frame(minWidth:)` grows with the proposal and `.position` proposes the entire canvas, so every auto-sized node became canvas-sized — nodes overlapped and swallowed each other's taps and drags, and the measured size fed edge anchoring the canvas box rather than the node. Nodes now shrink to fit with a minimum, which is what the web's `min-width` node box does. Found by the first device test to render a `<Flow>` canvas.
