---
'@pyreon/charts': minor
---

The option facade's family half: pie (radius pair → donut hole, per-slice itemStyle colours, label.show, legend), gauge (min/max, detail.show, progress/itemStyle colour, axisLine width), radar (`radar.indicator` → axes, areaStyle opacity, multi-series), candlestick (ECharts' `[open, close, low, high]` tuples, itemStyle color/color0), heatmap (`[xIndex, yIndex, value]` triples over category axes, `visualMap.inRange.color` ramp). `planOption` routes any option to the right half; `optionToSvg` renders every family through the family SVG helpers. The conformance corpus grows to 17 gallery-shaped fixtures with a floor of 15 clean.
