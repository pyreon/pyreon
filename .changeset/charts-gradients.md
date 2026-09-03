---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Linear gradients — `gradient` on a bar-family or `area` mark (ECharts' `LinearGradient` item and area style), the second command of DrawCmd v2. You give the stops and a direction; the engine resolves the two points against the PLOT box, so one ramp spans the chart instead of repeating inside every bar, and the same mark reads correctly at any size. The web canvas builds a `CanvasGradient`, the SSR SVG emits a `<linearGradient>` in `<defs>` with `gradientUnits="userSpaceOnUse"` and references it by id, SwiftUI fills with a `.linearGradient` shading and Compose with a `Brush.linearGradient` — all from the same `ChartGradient` in the draw list. Every gradient-bearing command still carries its solid `fill`, so a backend that cannot paint one, or a caller serializing commands without a `<defs>` to put them in, falls back to the colour rather than to nothing.
