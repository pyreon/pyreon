---
"@pyreon/charts": minor
---

Radial gradients are a first-class engine fill: a mark's `gradient: { stops, shape: 'radial' }` ramps out from the plot's centre on the web canvas, in SVG (`<radialGradient>`), and — through the generated engines — on iOS and Android; the option facade keeps every stop of an ECharts `{ type: 'radial' }` colour instead of degrading it to its first stop, and names an image pattern (`color: { image }`) instead of silently painting the palette colour. `ChartGradient` carries a `radial` flag; RTL mirroring, transposition, shifting and tweening move a radial ramp like a linear one. The large-data decimation (`samplingRequest`, `decimateShared`) is exported from `@pyreon/charts/option-layer` so the native compiler runs the same code the web runs.
