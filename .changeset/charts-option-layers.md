---
'@pyreon/charts': minor
---

Option-level layers for the ECharts facade: `resolveDataset` (the `dataset` pre-pass — array sources with auto/explicit `sourceHeader`, object sources, `dimensions`, `seriesLayoutBy: 'row'`, `encode` by name or index, `datasetIndex`; materialises category `xAxis.data` plus per-series data as values, `[x, y]` pairs for scatter, or `{ name, value }` items for the name-value families; never mutates the input; transforms warn by name) wired into BOTH facade halves, and `graphicCommands` (the `graphic` layer — text / rect / circle / line / polygon / polyline / group with `x`/`y`, `left`/`top`/`right`/`bottom`, percentages and `center`; unsupported types warn by name) appended above the chart in `optionToSvg` for cartesian and family options alike (`appendGraphicLayer` splices into a rendered `<svg>`). Conformance corpus 27 → 28, floor 25 → 26.
