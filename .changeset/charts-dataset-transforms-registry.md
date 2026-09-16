---
'@pyreon/charts': minor
---

`@pyreon/charts/plot` datasets: `registerChartTransform` accepts external transforms in the `echarts.registerTransform` shape (the same `upstream` surface, so ecStat transform objects register unchanged); a multi-result transform feeds `fromTransformResult`; datasets and series resolve by `id` / `datasetId` / `fromDatasetId`; `encode.seriesName` names a series after a dimension and `encode.itemName` names each datum. Unknown transform types still warn by name.
