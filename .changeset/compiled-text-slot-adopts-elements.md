---
'@pyreon/runtime-dom': patch
---

Hydration adopts the server's elements in a compiled text position that renders structural content, for example `<span>{parts(row)}</span>` where `parts` returns `['a ', <Code/>, ' b']`. The element (or the slot's range) used to be re-created with identical content and no report. A real difference inside is now reported through `onHydrationMismatch`.
