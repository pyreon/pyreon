---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Presentation states — ECharts `emphasis`/`select`/`blur` — go further, on web and native.

- A state's own stroke width (`lineStyle.width`) and area fill opacity (`areaStyle.opacity`) apply while that state is active.
- `emphasis.scale` grows the highlighted point's radius (`true` reads as ECharts' own 1.1); `emphasis.disabled` stops a series from ever highlighting.
- `emphasis.label` / `select.label` print the datum's label only in that state.
- `selectedMode: 'series'` pins a whole series with one tap, on `PlotChart`, on web, iOS and Android — the bar/stacked/grouped outline and the line/area/point fill both honour it.
- `emphasis.blurScope`'s three real values are accepted; an unknown one, `select.disabled`, `select.lineStyle`/`areaStyle`, `blur.label` and a state label's own styling are still named — a pinned datum has no line to stroke, and a blurred one keeps its own label.

Found on the way:
- `PlotChart` with `selectedMode` under a zoom window referenced rows a decimated chart never declares on native — fixed for the width-computed selection expressions too.
