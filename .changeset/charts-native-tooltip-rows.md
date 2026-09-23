---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

A series the option did not name no longer shows its generated "Series 1" in the default tooltip, on web and native. ECharts hides it: an item tooltip has no header, and an axis row has no name. A browser differential against real ECharts covers both cases, and the default trigger (item).

On iOS and Android, an OptionChart bar, line or scatter chart and a funnel now show ECharts' default tooltip rows, as the pie already did. An item tooltip, the default trigger, shows the series under the tap. An axis tooltip shows a row per series. The new engine functions are `tooltipAxisCells`, `tooltipItemCells` and `funnelTipRowsWith`. A formatted tooltip keeps the plain lines, since native runs no formatter function.
