---
'@pyreon/native-compiler': minor
'@pyreon/charts': minor
---

A literal `<OptionChart>` pie or gauge now draws on iOS and Android as the web compiled it.

- **Pie:** ECharts' arcs (start angle, direction, rose, minimum and pad angles), its outside labels with guide lines and overlap avoidance, and per-datum colours all cross. Taps and tooltips hit the same laid-out arcs.
- **Gauge:** the whole ECharts dial crosses: colour bands, ticks, split lines, axis labels, pointer, anchor, titles and the formatted detail. Before, native drew a half-circle track.

Placement (`center`, `radius` and the box keys) now resolves through a new engine module, `frame`, at the device's own size. The web uses the same function, so the two targets place a chart identically. `renderDial` takes an optional palette, and the new `renderDialIn`, `pieHitWith` and `pieTipWith` are shared by web and native.
