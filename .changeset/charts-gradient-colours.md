---
'@pyreon/charts': minor
---

The option facade reads ECharts' linear gradient colour objects (`{ type: 'linear', x, y, x2, y2, colorStops }`) on `itemStyle`, `areaStyle`, `lineStyle` and the series `color` as the engine's series gradient: direction from the dominant axis, a backwards ramp reverses its stops, the first stop is the solid colour. A radial gradient warns by name and degrades to its first stop.
