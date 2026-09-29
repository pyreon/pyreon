---
'@pyreon/core': patch
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

SSR now waits for a `lazy()` component whose chunk has not loaded yet, the same way it waits for an async component. Before, `renderToStream` swapped an EMPTY template into a `<Suspense>` boundary, replacing the fallback with nothing, and `renderToString` left the fallback in place. This hit the first request after a lazily-evaluated chunk.

`lazy()` exposes the settle promise as `__load()`. A streamed Suspense swap template is now bracketed with the same `<!--$-->…<!--/$-->` range the string renderer emits, so hydration adopts the swapped-in content instead of rebuilding it. Before, an async child was mounted a second time beside the server's copy.

`pyreon doctor diagnose` now recognises the "Suspense boundary caught an error — fallback will remain" line. A failed `lazy()` import on the server surfaces there.
