---
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

SSR now emits `class=""` for an EMPTY-STRING class resolution (nullish stays omitted), across all emission paths: `renderPropValue`, `_ssrAttr`, and both compiler backends' static bakes. The client has always materialized `class=""` for the same value (`[class]` attribute selectors distinguish presence), so omitting it server-side was a real SSR/CSR parity divergence — CSS matching `[class]` behaved differently before and after hydration — and it forced hydration adoption to pay an attribute write per row purely to materialize the attribute. The SSR render-fuzz byte-identity gate verified all four sites agree.
