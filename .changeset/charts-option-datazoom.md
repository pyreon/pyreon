---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`OptionChart` honours an ECharts `dataZoom` over the category x axis instead of ignoring it. `inside` zooms with the wheel and pans with a drag, and `slider` draws the navigator strip, whose band and handles drag the window. `start` / `end` (or `startValue` / `endValue`) set the opening window, `filterMode: 'none' | 'empty'` keeps the y extent of every row, and `zoomLock`, `minSpan` and `maxSpan` bound every gesture. Hits report the global row index, and `onDataZoom` reports the window in percent. SVG output draws the opening window and the strip. On native the option lowers onto `PlotChart`'s own zoom, which gains `initialZoom` and `zoomLimits` on web and native, with the limits applied by a new engine function. A y-axis or second-x-axis zoom is named, never applied to the wrong axis.
