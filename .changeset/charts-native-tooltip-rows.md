---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

The engine gains ECharts' default tooltip rows for cartesian charts and funnels: `tooltipAxisCells`, `tooltipItemCells` and `funnelTipRowsWith`. An item tooltip shows the series under the pointer or tap, an axis tooltip a row per series, and a series with no name shows no generated "Series 1". They are generated into the native engines, so iOS and Android show the same rows. A formatted tooltip keeps the plain lines on native, since native runs no formatter function.
