---
'@pyreon/charts': patch
---

Fix `<Chart>` ignoring compiler-branded props on mark children (`<Bar stack={hidden}/>`, `<Axis x hidden={hidden}/>` where the flag derives from a prop). Mark vnodes are never mounted, so nothing unwrapped their `_rp` thunks; the grammar resolver now reads every child's props through `makeReactiveProps` inside its resolving computed, so branded and getter-backed props resolve and re-resolve on signal change, while channel accessors, `format` and handlers are not called.
