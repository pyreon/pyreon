---
'@pyreon/native-compiler': minor
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/charts/plot` on iOS/Android — the native side of the host-parity audit.

- **A bare host follows the runtime colour scheme.** With no `theme` and no `<ChartThemeProvider>`, a chart on the web follows `prefers-color-scheme`; on a phone it was hard-wired to the light theme, silently. Every field the two built-in themes disagree on now lowers to a runtime conditional over SwiftUI's `colorScheme` environment / Compose's `isSystemInDarkTheme()`; sizes and timings stay literals; a named theme or a provider scope pins it as before.
- **`<BoxplotChart>` crosses**: its `fiveNumber` reduction and the whole frame (`boxplot-chart.ts`) are generated into both engines; the host lowers with an entrance, a tap per band and the theme. `boxplotToSvg` moves to `boxplot-svg.ts` (same export from `/plot`); `boxplotFrame` / `renderBoxplotChart` / `hitBoxplotChart` are exported.
- **`<RadarChart>` gets a tap on both targets** (`onSelect` / `onSelectIndex` receive the engine's `{ series, axis }` hit) — it had none on either.
- **What does not cross says so**: a rich-hit `onSelect` on the eleven table-driven hosts warns and names `onSelectIndex` (it vanished); `<ParallelChart tooltip>` warns (the policy claimed it lowered); `<MapChart>` declines by name instead of falling into the generic component emit as a symbol no target has.
- The Kotlin frame hosts (Heatmap, Candlestick, Boxplot, Radar) key their tap on the vals it captures, so a tap after a data change resolves against the current geometry (`pointerInput(Unit)` kept the first composition's).
- Device assertions in the tasks showcase on both platforms: a tap on the radar's first vertex reports series 0 / axis 0, a tap per boxplot band reports its index.
