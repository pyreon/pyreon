---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

The engine's default tooltip rows show what ECharts shows: a header and, per value, a round colour swatch, the name, and the value in bold at the right, comma-grouped (`2,500`) unless a `valueFormatter` shapes it. The box is edged in the series colour for an item tooltip. A pie's family tooltip no longer appends a `(100%)` share.

The rows are built by the new engine `renderTooltipRows` / `pieTipRowsWith`, so iOS and Android draw the same rows.
