---
'@pyreon/core': patch
'@pyreon/runtime-server': patch
'@pyreon/server': patch
---

`createUniqueId()` now returns the same id on the server and after hydration. It used to be one process-wide counter that nothing reset, so a server-rendered `id` and the id the hydrated component held were different strings, and a later `aria-controls` could point at an element that did not exist.

The server now counts per request (every request restarts at 1, and concurrent renders no longer share a counter). Each island gets an id namespace of its own (`pyreon-i1-…`), written to `data-id-prefix` on the island marker and restored when the island hydrates. It holds while the components that call it render in the same order on both sides; a streamed Suspense boundary that resolves out of order is the exception.
