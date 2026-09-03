---
"@pyreon/native-compiler": minor
"@pyreon/native-runtime-swift": minor
"@pyreon/native-runtime-kotlin": minor
"@pyreon/charts": minor
"@pyreon/compiler": patch
---

`<PieChart>` and `<GaugeChart>` from `@pyreon/charts/plot` cross to native: PMTC lowers them to the new runtime `PyreonPieChart` / `PyreonGaugeChart` views (SwiftUI + Compose), drawn by the generated `PyreonChartEngine` — web and native render the same byte-locked geometry. Accessor props pass through as closures (the wrappers are generic over the row type, with `Number`/`Int` seams for integer columns), `data-testid` + a11y ride the special-emitter tail, and the decline paths warn by name (an `(d, index)` accessor, missing required props, the web-only legend/hit-testing surface). The charts manifest now declares `nativeFrontend`, so subpath imports of the web-only components (`PlotChart`, heatmap, candlestick) get the per-package advice instead of silence — the symbol-level warn table lookup is root-normalized (`@pyreon/charts/plot` matches the `@pyreon/charts` entry; the `/webview` bridge stays exempt).

The diagnose catalog teaches the unlowered-chart-tag error: `cannot find 'PieChart' in scope` / `Unresolved reference 'PlotChart'` now explains the radial decline paths and the web-only cartesian family, with the `<Web>`/webview remedies.
