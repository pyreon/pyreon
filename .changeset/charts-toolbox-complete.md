---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The chart toolbox (ECharts' `toolbox` model) works on web and native.

- `PlotChart toolbox` gains `magicType` stack / tiled, a box-select `dataZoom` with a back button, and a data view of the chart's table.
- On iOS and Android, every tool lowers onto the chart host. `saveAsImage` opens the share sheet, or hands `onSaveImage` a PNG data URL, on the plot host and on the family charts (pie, heatmap, sankey, …).
- A custom `myTool`, whose `onclick` is a function, and a y-axis box zoom are named in a warning, not silently dropped.

Also fixed:
- Two charts on one native screen with zoom state no longer declare the same SwiftUI state twice.
- `describeChart` no longer indexes past an empty category list, which crashed Android on a chart without categories.
