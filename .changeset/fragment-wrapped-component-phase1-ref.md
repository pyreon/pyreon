---
'@pyreon/compiler': patch
---

Fix a fragment-wrapped absorbed component child losing its phase-1 element ref

`templatizeComponentChildren` gives an element a phase-1 `const __eN` ref when it absorbs a COMPONENT child, because that child's `_mountChild` runs in phase 2 — after a preceding `_setChildAt` / `_mountSlot` has already detached the node an inlined walk would start from (PZ-08).

The scan that decided this read only DIRECT children, while `flattenChildren` — which the emit actually uses — recurses into fragments at any depth. So `<div>{x}<section><><Leaf /></></section></div>` absorbed the component but got no ref, and its `_mountChild` received `__p0.nextSibling` evaluated after `__p0` was gone: a null parent, rendering `<section></section>` with the component silently dropped.

Both backends now mirror `flattenChildren`'s fragment recursion. Pinned by two shapes in the ON-vs-`h()` equivalence table.

Bisect-verified per BACKEND: reverting only the JS side leaves all 28 specs green, because `transformJSX` prefers the native binary.
