---
'@pyreon/charts': minor
---

Datum-anchored point markers — ECharts' markPoint, engine-shaped. `ChartSpec.markers` / `ChartToSvgOptions.markers` take `PointMarker[]`: anchor at a series' `'max'`/`'min'` or a concrete `atIndex` (clamped), with label above the point, colour/radius defaulting to the series' own. Markers draw OVER the series in painter's order, grow with the entrance `progress`, scale against the series' OWN axis (a right-axis series marks on the right domain), and skip joint layouts (stacked/grouped) and the horizontal frame rather than guessing — a marker with no anchor is skipped, the Annotation precedent. The anchor is split into two fields (`at` + `atIndex`) rather than one mixed string/number union deliberately: the split keeps the engine inside the native-compilable subset at zero caller cost.
