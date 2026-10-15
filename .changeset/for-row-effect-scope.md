---
'@pyreon/runtime-dom': patch
'@pyreon/reactivity': patch
---

Fix: an `effect()` or `computed()` created directly in a `<For>` row callback is now disposed when its row is removed and when the list unmounts. It previously had no owner, so a removed row kept running its effects indefinitely. Rows that create nothing pay no allocation; the fair benchmark shows no measurable cost.
