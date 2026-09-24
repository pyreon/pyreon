---
'@pyreon/charts': minor
---

Per-datum colour: the engine's `Series` gains an `itemColors` channel, generated into the native engines, and every datum fill (bars, stacked and grouped segments, waterfall steps, points) goes through it, so hover, select and blur act on the datum's own colour.

The shared canvas host gains a `cursor` hook: the pointer over an item shows its cursor, `pointer` by default, as in ECharts.
