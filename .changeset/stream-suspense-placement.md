---
'@pyreon/runtime-server': patch
---

Streaming SSR: a `<Suspense>` boundary inside a `<For>` component row, or inside another `<Suspense>`, now resolves in place.

The boundary's wrapper was written straight to the main stream while the content around it was still buffered (a `<For>` row waiting for its key-marker decision, or an outer boundary's resolved children). The wrapper landed empty and outside its row, so the resolved content was swapped in beside the row and the fallback never went away. The wrapper is now written in place, and a boundary emits its swap only once its target is in the document. The `<For>` case was a regression in this release cycle; the nested case predates it.
