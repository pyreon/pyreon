---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

An option chart's default tooltip (no `formatter`) now shows exactly what ECharts shows. It has a header and, per value, a round colour swatch, the name, and the value in bold at the right, comma-grouped (`2,500`) unless a `valueFormatter` shapes it. The box is edged in the series colour for an item tooltip. It is locked by a browser differential against real ECharts. A pie's family tooltip no longer appends a `(100%)` share.

On native, an option pie's tooltip draws the same rows through the new engine `renderTooltipRows` / `pieTipRowsWith`, and a tooltip `valueFormatter` (a function) no longer costs a native option pie its arcs, labels and placement.
