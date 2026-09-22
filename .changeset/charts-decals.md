---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Decals follow ECharts' model on web and native. A decal tiles its `symbol` (rect, circle, triangle, diamond, pin or arrow) on the `dashArrayX`/`dashArrayY` pitch, scaled by `symbolSize` and turned by `rotation`. Previously every decal collapsed to diagonal, cross or dots. `aria.decal.show` gives each series without a decal a distinct default texture. Pattern geometry now lives in one engine function (`patternMarks`) that the web canvas, SVG, SwiftUI and Compose painters all draw, so a texture cannot differ by target. `ChartPattern` gains `angle`, `symbol` and `spacingY`, and a `symbols` kind.
