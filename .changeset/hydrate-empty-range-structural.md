---
'@pyreon/runtime-dom': patch
---

Hydration now reports a reactive child that renders an element, an array or a component's output where the server rendered nothing (an empty `<!--$-->` range, or an empty element whose sole child is the accessor, on both the `h()` and the compiled `_mountSlot` paths). Text in that position was already reported; a structural value mounted silently. The report reaches `onHydrationMismatch` handlers in production too, as `{ type: 'tag', expected: <the client's first element>, actual: '' }` (or `type: 'text'` when the first thing rendered is text). A value that renders nothing (`null`, `[]`, a component returning `null`) is not reported.
