---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The labels at the ends of an x value axis are no longer cut off by the canvas, and `<Axis y format>` now overrides a chart-level `format` as documented.

An upright x tick label is centred on its tick, so the first and last ones hang past the plot by half their width. The right gutter was a fixed 12px and the left one held only the y labels, so a wide label was clipped: a horizontal bar chart in milliseconds showed `300.0 r` at its right edge. The layout now measures that overhang and widens the gutter to hold it, on the web and in the native chart engines. Category axes keep their slim gutter.

`<Chart format={a}><Axis y format={b} /></Chart>` used `a` for the axis, the tooltip and the description, although `ChartProps.format` says the axis format overrides it. It now uses `b`, on plot and family charts alike.
