---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Charts: a horizontal bar chart (a category y axis over a value x axis) now lays out as ECharts does — it previously drew nothing, on web and native — including split areas and minor lines on the value axis. A scrolling legend clips the entry the window cuts instead of dropping it, pages vertically, and honours `pageButtonPosition: 'start'`; the draw list gains `clip` / `unclip` commands, executed by the canvas, SVG, SwiftUI and Compose painters. Rich and multi-line labels now rotate as one block, with ECharts' line height.
