---
'@pyreon/charts': minor
---

A family series fed by a `dataset` is now mapped the way ECharts maps it. Candlestick (`[open, close, lowest, highest]`), boxplot (five numbers), heatmap (`[x, y, value]`), radar (a named polygon per row), parallel (a line per row), theme river (`[date, value, name]`), gauge and map now read their own tuple shape through `encode`. Before, they read one value column and came out wrong. A series' own `dimensions` now names the columns it reads, and the dataset keys (`datasetIndex`, `datasetId`, `seriesLayoutBy`, `dimensions`, `encode`) are declared for every family that consumes them. `seriesLayoutBy` on graph, sankey, tree and chord is recorded as inert, because ECharts builds those series from their own data and never from a dataset.
