---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Rounded bars — `borderRadius` on a bar-family mark (ECharts' `itemStyle.borderRadius`), the first command of DrawCmd v2. A number rounds all four corners, `[topLeft, topRight, bottomRight, bottomLeft]` rounds them individually, and the radius travels in the draw list as `corners` on the rect command rather than in any one backend: the web canvas traces four arcs, the SSR SVG emits a path of the same four arcs, and the SwiftUI and Compose canvases build the same path from the same clamped numbers. The clamping lives in the ENGINE (`cornerRadii`, half the shorter side), so it crosses to native with the generated engine and a bar animating up from the zero line rounds proportionally on all four backends instead of by four platform conventions. A mark without `borderRadius` emits no `corners` key at all, so existing charts serialize byte-identically.
