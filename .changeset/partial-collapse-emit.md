---
'@pyreon/compiler': patch
---

PR 3 of the partial-collapse build (open-work #1): `tryRocketstyleCollapse`
falls back to `tryPartialCollapse` (PR 1's `detectPartialCollapsibleShape`)
when the full `detectCollapsibleShape` bails, emitting `__rsCollapseH(...)`
+ a residual-handlers object (consumed by PR 2's `_rsCollapseH`) for the
`on*`-handler-only subset. Purely additive — the full-collapse and
non-collapse code paths are byte-identical (the only delta is the
`if (!shape)` fallback line + a conditional `_rsCollapseH` import that is
byte-identical when no partial site fired). Off by default; emits only
when `collapseRocketstyle` is configured AND the plugin has resolved the
partial site (the resolver/plugin-scan half is the follow-up PR).
