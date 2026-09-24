---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
---

Lower static pictorial-bar options to the native chart renderer on iOS and Android, including supported symbol shapes, repeated symbols, stacking, grouping, labels, colors, and patterns. Unsupported symbol shapes now produce a focused diagnostic and safely render as rectangles.
