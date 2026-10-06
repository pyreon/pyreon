/**
 * `@pyreon/charts/native-plugin` — how this library crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the chart hosts' emit for both targets,
 * the generated engine's struct registry, the colour-scope providers
 * (`<ChartThemeProvider>` + the chart theme `<PyreonUI mode>` / `<ColorModeProvider>`
 * resolve to) and the compile-gate stubs. `@pyreon/native-cli` discovers it from
 * `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/charts`, so `@pyreon/native-compiler` carries none of it.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { chartsPlugin, chartsPlugin as default } from './native-plugin/plugin'
export { chartsStubs, kotlinChartAugmentation, swiftChartAugmentation } from './native-plugin/stubs'
