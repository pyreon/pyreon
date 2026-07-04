---
'@pyreon/reactivity': patch
---

Add `_rdNodeId(x)` (dev-only) — reads the reactive-graph node id stashed on a signal/computed callable or `effect()` handle, returning `undefined` for non-reactive values or production builds. The `effect()` handle now also carries the id (mirrored from its internal run closure). This is the name-stable accessor `@pyreon/testing`'s reactive matchers target so they never reach for the internal `__pxRdId` property directly. Zero production impact — tree-shaken with the rest of the `__DEV__` reactive-devtools bridge.
