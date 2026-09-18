---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The ECharts `brush` works on web and native.

- `PlotChart` takes `brushType` (rect, polygon, lineX, lineY), `brushMode`, `outOfBrushOpacity`, `brushSeriesIndex` and `onBrushSelected`. Datums outside the brush fade, and the callback reports the brushed data indices per series.
- `toolbox.brush` adds the rect / polygon / lineX / lineY / keep / clear tools.
- `OptionChart` reads `option.brush` and `toolbox.feature.brush`, and reports through `onBrushSelected`. As in ECharts, a brush is taken up through its toolbox tool.
- iOS and Android lower all of it onto the chart host. The selection geometry is one shared engine module.
