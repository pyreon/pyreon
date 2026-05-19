---
'@pyreon/runtime-dom': patch
---

Add `_rsCollapseH` + `_bindEvent` — PR 2 of the partial-collapse build
(open-work #1). Purely additive: `_rsCollapseH` is `_rsCollapse` plus
re-attachment of the residual `on*` handlers `detectPartialCollapsibleShape`
(compiler PR 1) peels off, routed through the canonical
`_bindEvent`→`applyEventProp` path (delegation/batching/name-normalization
unchanged). `_bindEvent` is a thin export of the existing `applyEventProp`.
No production path emits `_rsCollapseH` yet (the compiler/plugin wiring is
the follow-up PR), so existing runtime behaviour is byte-unchanged.
