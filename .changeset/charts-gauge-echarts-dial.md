---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

OptionChart and optionToSvg now draw a gauge the way ECharts does:
- the axis line in colour bands (`axisLine.lineStyle.color` stops, `roundCap`);
- split lines, ticks and labels round the dial (lengths in pixels or percent of the radius, `auto` colours, label `formatter` / `rotate`);
- a pointer and an optional progress arc per value (`overlap`, `clip`, `roundCap`);
- the anchor, and each value's title and detail, with per-datum offsets;
- the detail box (background, border, width, height, padding);
- pointer and anchor icons (rect, circle, diamond, triangle, arrow);
- `startAngle` / `endAngle` / `clockwise` / `min` / `max` / `splitNumber`.

All of it is checked against ECharts' own SSR output. Text draw commands gain an optional `weight` ('bold'), drawn by the web canvas, the SVG string and both native canvases.
