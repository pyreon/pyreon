---
'@pyreon/charts': minor
---

Option axes draw their lines, ticks and split lines as ECharts does. An axis shows its line and ticks only when the other axis is a value axis, and a category axis on bands drops its ticks. So a bar chart's value axis has no line, and a value-by-value scatter has both lines, ticks and vertical split lines. `axisLine` (`show`, `lineStyle`) and `axisTick` (`show`, `length`, `inside`, `alignWithLabel`, `lineStyle`) are read, and so is `splitLine.lineStyle` (colour, width, `dashed` / `dotted` / custom dash). The second y axis draws its own split lines. Compared stroke by stroke against ECharts' SVG.
