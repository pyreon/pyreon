---
'@pyreon/native-compiler': minor
---

`<OptionChart>` resolves a literal `dataset` at compile time with the web facade's own resolver: `source` / `dimensions` / `sourceHeader`, `datasetIndex` / `datasetId`, `encode` (x / y / itemName / seriesName / tooltip) and the built-in `filter` / `sort` transforms materialise the series data, the category axis and the tooltip extras on Swift and Kotlin. A registered transform is named as web-only. Marks carry `extras` into the engine's `Series`.
