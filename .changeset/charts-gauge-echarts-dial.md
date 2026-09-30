---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`<GaugeChart dial>` draws a gauge the way ECharts does, from a spec built by the new `gaugeDial()` builder:
- the axis line in colour bands (colour stops, `roundCap`);
- split lines, ticks and labels round the dial (lengths in pixels or percent of the radius, `auto` colours, label formatter / rotation);
- a pointer and an optional progress arc per value (`overlap`, `clip`, `roundCap`);
- the anchor, and each value's title and detail, with per-datum offsets;
- the detail box (background, border, width, height, padding);
- pointer and anchor icons (rect, circle, diamond, triangle, arrow);
- start and end angles, direction, `min` / `max` and `splitNumber`.

Text draw commands gain an optional `weight` ('bold'), drawn by the web canvas, the SVG string and both native canvases.
