---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/mcp': patch
---

The chart handle's `dispatch` (ECharts' `dispatchAction`) is now one pure reducer, `applyChartAction`, and it runs on web, iOS and Android.

- New actions: `takeGlobalCursor` (arm the area brush) and `brush` (set or clear its areas).
- A dispatched `brush` fires `onBrushSelected`, as a drag does.
- On native, `createChartHandle()` lowers to a `PyreonChartHandle`. A bound `PlotChart` reads and writes its fields, and `handle.dispatch({ ... })` with an inline action object lowers too.
- Fixed: a `PlotChart` with `selectedMode` under a zoom window no longer fails to compile on native.
