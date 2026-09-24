---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`PlotChart`'s zoom gains `initialZoom` (the opening window) and `zoomLimits` (`zoomLock`, `minSpan`, `maxSpan`) on web and native, with the limits applied to every gesture by a new engine function.
