---
'@pyreon/compiler': patch
---

Add `detectPartialCollapsibleShape` + `CollapsibleHandler` — PR 1 of the
partial-collapse build (open-work #1). Purely additive: a new exported
detector for the `on*`-handler-only collapsible subset (literal dimension
props + peeled event handlers). No production path calls it yet (the
`tryRocketstyleCollapse` fallback + plugin scan land in a follow-up PR),
so existing compiler behaviour is byte-unchanged.
