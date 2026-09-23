---
'@pyreon/charts': minor
---

Option line series take their shape from ECharts. `smooth` draws ECharts' own Bézier per segment (0.5 for `true`, with `smoothMonotone: 'x' | 'y'` read), instead of a monotone cubic. `step: true` / `'start'` now rises first, as ECharts does; `'middle'` and `'end'` are drawn too. `connectNulls` bridges a missing value instead of breaking the line. Each shape is compared against ECharts' own SVG path.
