---
'@pyreon/runtime-dom': patch
---

Add `_rsCollapseH` — the partial-collapse runtime helper (PR 2/4 of the
#1 build). `_rsCollapse` + residual `on*`-handler re-attach through the
canonical `_bindEvent` → `applyEventProp` path. Additive: new export,
not yet wired into the compiler emit (PR 3); `_rsCollapse` and every
existing export unchanged.
