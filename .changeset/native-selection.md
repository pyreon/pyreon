---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart selectedMode onSelectChange>` now lowers to iOS and Android: a tap
pins a datum, the engine draws the pinned outline from `ChartSpec.emphasis`, and
the change reports with global indices.

The pin logic moved out of `<Chart>`'s `pickDatum` into `pinSelection`, a
crossing helper beside `legendToggle`, and the web calls it too — so the three
targets cannot come to disagree about what a second tap does.

`emphasis` and `onHighlight` stay web-only, and their reasons are corrected:
both are hover-driven (`mouseover`/`mouseout`), which a touch target has no
analogue for. The old text said they were "waiting on host state", which read as
unbuilt work. The state exists now, and they still do not lower — because a tap
is a pick, not a hover.
