---
'@pyreon/compiler': patch
---

Diagnose catalog: teach the `elementRef` `.current` assignment TypeError

`elementRef()`'s `.current` is a read-only getter (the value is set by
CALLING the ref, which is what the runtime does at mount/unmount). Code
migrated from `createRef()` that assigns `el.current = node` throws
`Cannot set property current of … which has only a getter` — `pyreon doctor
diagnose` / MCP `diagnose` now explain the callable-ref contract and point
at `el(node)` or `createRef()`.
