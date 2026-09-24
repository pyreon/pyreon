---
"@pyreon/native-compiler": minor
---

`<OptionChart>` on native: an ECharts radial gradient lowers to the radial mark gradient (it used to warn and degrade to a solid colour); the large-data keys `sampling` / `large` / `largeThreshold` / `progressive` / `progressiveThreshold` thin the literal rows at compile time through the web facade's own decimation, against the option's static `width` (or the web's 640 default), so the native chart carries the datums the web draws; an image pattern colour is named. Fixed: a negative literal datum (`data: [1, -2]`) made the whole option emit nothing — a unary minus over a numeric literal now reads as the literal it is. `PlotChart` marks accept `gradient.shape`.

`<OptionChart>`'s `emphasis` / `select` / `blur` states lower to the mark's `focus` / `emphasisColor` / `selectColor` / `blurOpacity`, and `selectedMode` to the host's tap-to-pin state; state labels, symbol scale and whole-series selection are named. `PlotChart` marks accept the same four options.

The six pictorialBar geometry keys lower natively (`symbolOffset` through a new array-valued mark-option kind); percent strings and an unknown `symbolPosition` are named.

`<OptionChart option.graphic>` crosses: the elements are positioned at compile time through the web facade's own resolver and painted by the engine's `graphicDrawCommands` on both targets; a non-literal `graphic` is named rather than dropped.
