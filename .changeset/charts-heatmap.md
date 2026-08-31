---
'@pyreon/charts': minor
---

`<HeatmapChart>`: two categorical axes, a value per cell, color as the third
channel. First-seen category order (weekday names carry an order sorting
destroys), duplicate observations sum, absent cells stay undrawn — absence
and zero are different facts. The `#rrggbb` ramp interpolation is hand-rolled
so the same code lowers to native, and the geometry (`buildHeatGrid`,
`colorRamp`, `renderHeat`) is exported standalone like the rest of the
engine.
