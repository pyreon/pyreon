---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`yAxis.inverse: true` draws the value axis upside down, on web and native. The engine's `Domain` gained an `inverse` flag honoured by the linear scale, so marks, ticks and hit-testing all invert together. Stacked bars and filled areas now build their geometry through the scale, so they invert too.
