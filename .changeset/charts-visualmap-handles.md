---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The visualMap is interactive on web and native. A `calculable` continuous strip has two handles that drag the in-range interval, and a piecewise strip's swatches toggle their pieces. Values outside the selection take `inactiveColor` (`#ccc` by default). `range` and `selected` set the initial selection. The heatmap, calendar and map hosts draw the strip and own the gesture: `<HeatmapChart visualMap>`, `<CalendarChart visualMap>`, `<MapChart visualMap>` with `onVisualMapChange`, each built with the `visualMap({ domain })` builder. Native builds the strip at compile time and keeps the selection in host state. The strip geometry, hit tests and colouring rule are one engine module shared by every target.
