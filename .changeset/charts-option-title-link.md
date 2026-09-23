---
'@pyreon/charts': minor
---

`<OptionChart>` gains a `link` prop: charts given the same `createChartLink()` share one zoom window and one hovered datum, as ECharts' `echarts.connect` couples charts. Before, only `PlotChart` could be linked. The option title now reads `left`/`right`, `textAlign`, `textStyle` and `subtextStyle` colour and size, and `itemGap`. Before, it was always a left-aligned block in the theme colour.
