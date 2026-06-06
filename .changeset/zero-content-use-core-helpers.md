---
'@pyreon/zero-content': patch
---

refactor(zero-content): use core `cx()` + `createUniqueId()` helpers

Replace string-concat class merging with `@pyreon/core`'s `cx()` across
9 components (Tabs, PropTable, Details, APICard, Mermaid, Playground,
Toc, CompatMatrix, Math). Mechanical sweep — output is identical.

Mermaid's hand-rolled module-level id counter (`pyreon-mermaid-${n}`)
replaced with `createUniqueId()` from `@pyreon/core`. The framework
ID generator is SSR-safe and won't collide across re-mounts.

No behaviour change. 662/662 tests pass.
