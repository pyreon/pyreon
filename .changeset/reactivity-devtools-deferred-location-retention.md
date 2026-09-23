---
'@pyreon/reactivity': patch
---

The dev-mode devtools registry no longer keeps reactive nodes, or what their creators closed over, in memory. Each signal, computed and effect created in development captures an `Error` so its source location can be parsed on demand. That unformatted `Error` held every captured frame's function and closure, and it sat on a record in a strong map, so a node whose creator could reach it was never released. In practice, an unmounted component that created a signal stayed in memory for the whole dev session. The pending location now lives in a `WeakMap` keyed by the node, and the capture keeps only the frames the parser reads. Production builds were never affected, because this path is dev-only.
