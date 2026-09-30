---
'@pyreon/charts': minor
---

`<Chart by>` now morphs geometry by key on plain bar and line charts, like D3's data join. A surviving row slides from its old slot to its new one, an entering row grows from the baseline in its new slot, and a removed row shrinks to the baseline in its old slot, so a sliding window visibly slides instead of jumping one slot on the first frame. Other chart kinds (stacked, grouped, horizontal, log, dual-axis) keep the per-row value tween.
