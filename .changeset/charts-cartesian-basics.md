---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Bar thickness, per-datum colour and bridged gaps in `@pyreon/charts`.

- **Bar thickness.** `<Chart barWidth barGap barCategoryGap>` (and the same props on `<PlotChart>`). `barWidth` is a px ceiling on one bar, `barGap` the space between the bars of a group as a fraction of a bar, `barCategoryGap` the space between categories as a fraction of the band (0.25 by default, as before). They reach plain, stacked, grouped and waterfall bars in both orientations, and the hit target, the keyed morph and the server-rendered frame follow the drawn bar. They lower to iOS and Android as literals. A chart that sets none draws exactly as before.
- **Per-datum colour.** `fill={fillBy('tone')}` reads a colour off the row; `fill={shadeBy('margin', { ramp })}` maps a value through a ramp. Both are imported bindings, so a chart that does not use them does not bundle them, and `fill` is a descriptor rather than a string so it cannot be mistaken for the series colour (`color="#hex"`) or the long-format split (`<Chart color="field">`). A shaded chart draws a ramp legend above the plot (low and high values at its ends; also in server SVG and mirrored under `rtl`), and the value behind each colour is a `(shade)` row in the tooltip and a column in the accessible table. The default ramp follows the theme. Bars and dots. `fillBy('field')` / `shadeBy('field', { ramp, domain })` with a literal field name lower to iOS and Android (the engine colours from data); an accessor function, the legend and the `(shade)` rows are web-only and the compiler names each.
- **`connectNulls`** on `<Line>` and `<Area>` draws one stroke (or fill) through the finite points instead of breaking at each gap. The gap stays missing data in the tooltip and the table. Default off. Lowers to iOS and Android.

The generated native chart engine gains the bar-geometry parameters and the new `Series` fields; apps that do not use the options emit and draw the same as before.
