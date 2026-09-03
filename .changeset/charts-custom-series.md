---
'@pyreon/charts': minor
---

Custom series in the option facade: `type: 'custom'` with ECharts' `renderItem(params, api)` — `api.value` / `api.coord` / `api.size` / `api.style` / `api.visual` map data to pixels through the chart's own layout, returned elements lower through the same graphic vocabulary as the `graphic` option (rect, circle, line, polygon, polyline, text, group), `encode.x` / `encode.y` feed the axis extents, `null` items are skipped and a throwing `renderItem` warns per datum. `customCommands` is exported for hosts. Conformance corpus 31 → 32, floor 29 → 30.
