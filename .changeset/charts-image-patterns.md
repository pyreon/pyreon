---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Image patterns and `path://` / `image://` decal symbols draw on web and native. An ECharts `color: { image, repeat }` fill (a URL, a data URI, an `<img>` or a `<canvas>`) tiles at its natural size with `repeat`, `repeat-x`, `repeat-y` or `no-repeat`; an `image://` decal tiles the image on the decal pitch; a `path://` decal draws its SVG path (`M L H V C Q Z`), fitted to the symbol size. The web canvas, SwiftUI and Compose load each image once and repaint when it arrives. A line stroke image is named, since only fills take patterns.
