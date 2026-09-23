---
'@pyreon/charts': minor
---

`<OptionChart>` applies the option's `tooltip` component to family charts (pie, funnel, gauge, radar, candlestick, heatmap, treemap, sunburst, tree, sankey, graph, chord, calendar, parallel, polar, theme river, map). Before, a family option showed no tooltip at all. The option's `trigger`, `triggerOn`, template and function `formatter` (with ECharts' `params`, including the pie's largest-remainder `percent`), `valueFormatter`, `position` and look now apply, refined by a series' own `tooltip`. A series' `cursor` and `silent` apply too. The facade's `rtl`, `toolbox`, `keyboard` and `accessibleTable` props now reach a family host, and a family layer's box mirrors under `rtl`. The canvas host gains `itemTooltip`, `itemCursor` and `itemSilent` props, applied to the item a family reports through its new `item` hook.
