---
'@pyreon/runtime-dom': patch
---

A `<For>` nested in another `<For>`'s row no longer disposes the outer row's effects when the inner list removes or replaces its first row (#4800). Each row callback runs under a pooled collector scope, and the inner list's first row was handed the collector the outer row was still filling; removing that row stopped it. In 0.54 this disposed the inner `<For>`'s own effect, so the list stopped updating after it replaced its first row; an `effect()` created in the outer row callback was disposed the same way. A row now claims the collector before its callback runs.
