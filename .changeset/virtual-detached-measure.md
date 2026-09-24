---
'@pyreon/virtual': patch
---

Fix dynamically-measured lists mounting scrolled away from the top on `@tanstack/virtual-core` 3.17.11.

`<For>` mounts its first window into a detached fragment, so each row's `ref` called `instance.measureElement(el)` on an element with no layout box and recorded a size of 0. From virtual-core 3.17.11 each 0-to-real correction was treated as a row above the fold and scrolled the viewport by one row, so the list mounted at around row 8 with the rows above it collapsed. `useVirtualizer` and `useWindowVirtualizer` now defer measuring a detached element until it is attached, and never record a 0 read from one (the cached size or the estimate stands in, and the ResizeObserver delivers the real size).

Also fixes `item(index)` seeding: rows of the first window read `start()` as 0 until some later update happened to arrive, which never came when measured sizes matched the estimate.
