---
'@pyreon/charts': minor
---

visualMap component: `visualMapSpec` (reads `visualMap` — `inRange.color` stops, `min`/`max` or the first series' data extent, `type: 'continuous' | 'piecewise'` with explicit `pieces`, `categories`, or `splitNumber`, `orient`, `text`, `itemWidth`/`itemHeight`, `show: false`; `calculable` warns), `renderVisualMap` (a 24-stripe ramp strip with end labels, or swatches + labels, vertical or horizontal, reporting its size), `domainFromSeries`, and `visualMapCommands` (placed by `left`/`right`/`top`/`bottom`, ECharts' bottom-left default) — appended above the chart in `optionToSvg` for both facade halves and exported for hosts. Conformance corpus 28 → 29, floor 26 → 27.
