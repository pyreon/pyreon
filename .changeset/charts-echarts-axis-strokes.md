---
'@pyreon/charts': minor
---

The engine's axes draw their lines, ticks and split lines as ECharts does. An axis shows its line and ticks only when the other axis is a value axis, and a category axis on bands drops its ticks. So a bar chart's value axis has no line, and a value-by-value scatter has both lines, ticks and vertical split lines. Axis line and tick visibility, tick length, inside ticks, `alignWithLabel` and line styles (colour, width, `dashed` / `dotted` / custom dash) are configurable, and the second y axis draws its own split lines. An axis line and its ticks move onto the other axis's zero when that range crosses it (ECharts' `onZero`, on by default); the labels stay at the edge.
