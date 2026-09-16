---
"@pyreon/charts": minor
---

Radial gradients are a first-class engine fill: a mark's `gradient: { stops, shape: 'radial' }` ramps out from the plot's centre on the web canvas, in SVG (`<radialGradient>`), and — through the generated engines — on iOS and Android; the option facade keeps every stop of an ECharts `{ type: 'radial' }` colour instead of degrading it to its first stop, and names an image pattern (`color: { image }`) instead of silently painting the palette colour. `ChartGradient` carries a `radial` flag; RTL mirroring, transposition, shifting and tweening move a radial ramp like a linear one. The large-data decimation (`samplingRequest`, `decimateShared`) is exported from `@pyreon/charts/option-layer` so the native compiler runs the same code the web runs.

ECharts' states cross the engine: a mark's `emphasisColor` / `selectColor` / `focus` / `blurOpacity` colour the highlighted and pinned datums and fade the others while a highlight is active (`stateFill`, `blurActive`), the option facade maps `emphasis.itemStyle.color`, `select.itemStyle.color`, `emphasis.focus`, `blur.itemStyle.opacity` and `selectedMode`, and `<OptionChart>` hovers and pins per `selectedMode` (its host learns the hover even without a tooltip). What a state changes beyond its fill — a label, a symbol scale, whole-series selection — is named. `<SingleAxisChart>` gains the shared tooltip (it mounted none). The shared canvas host takes an optional `leave` hook.

Pictorial bars: `symbolMargin`, `symbolOffset`, `symbolPosition`, `symbolRotate`, `symbolClip` and `symbolBoundingData` are engine geometry (`engine/pictorial.ts`) on every target; a percent string warns by name instead of being ignored.

The `graphic` layer is a first-class engine module: `arc`, `ring`, `sector` and `bezierCurve` join text/rect/circle/line/polygon/polyline/group, and an `image` element warns by name instead of being reported as an unknown type. `@pyreon/charts/option-layer` exports `graphicElements`, `graphicDrawCommands` and `GraphicElement`.
