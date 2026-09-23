---
'@pyreon/charts': minor
---

An option line with `areaStyle` now draws as ECharts does. It stays a line, with its stroke and symbols drawn over a fill at ECharts' 0.7 opacity; before, it was an opaque polygon with no line. `areaStyle.opacity`, `color` and `origin` (`auto` closes to zero, or the nearer edge; `start`, `end` or a value) are read, so a range through zero closes to the zero line instead of the floor. Compared against ECharts' SVG.
