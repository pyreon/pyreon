---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Text fusion now also covers an ALL-STATIC text run. `<li>Row {it.index}</li>` inside a `<For>` row used to bake `Row <!>` and swap the placeholder for a new text node on every row (a `createTextNode` plus a `replaceChild`). It now compiles to one `_setChild(el, _fuse("Row ", it.index))` into an empty element: a single text node, and the same in-place `.data` adoption on hydration that a lone static `{x}` child gets. Measured on the virtual-list scenario against `@tanstack/react-virtual`: `jump to row 5,000` (23 rows remounted) moved from 1.15–1.23× behind to 1.09–1.15× ahead, and `scroll 60 steps` from a tie to 1.11–1.12× ahead. SSR and `h()` output are unchanged.

`_setChild` (and the other static/polymorphic child setters) now mount an array that contains a nested array or a function, instead of stringifying it. A fused run whose part is a `VNode[]` or a reactive accessor renders its elements, or stays live; it no longer prints `[object Object]` or the function source.
