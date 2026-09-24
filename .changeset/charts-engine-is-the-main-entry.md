---
'@pyreon/charts': minor
---

**Breaking:** `@pyreon/charts` is now Pyreon's own chart engine, and the ECharts wrapper that 0.51 shipped is removed.

In 0.51 the package wrapped the ECharts library: `<Chart options>`, `useChart`, and the `/manual`, `/vite` and `/webview` (`ChartWebView`) entries. 0.52 replaces all of it. `<Chart>` is now the engine's component, composed from mark children over your own rows (`<Chart data={rows}><Bar y="revenue" /></Chart>`), and the wrapper is not moved to another entry — it is gone. There are no aliases.

- `.` — `<Chart>` and its marks, the family components (`GaugeChart`, `RadarChart`, `TreemapChart`, `SankeyChart`, …), formatters, theme and linking, plus the data types those take.
- `/svg` — `chartToSvg` and the `*ToSvg` family, server-safe.
- `/engine` — layouts, hit tests, `PlotChart` and the rest of the engine; outside the stability promise.

`echarts` is no longer a peer dependency, and the `tslib` Vite alias (`chartsViteAlias`) is no longer needed. There is no mechanical translation from an ECharts option to marks; `pyreon check` flags code still importing the 0.51 wrapper and names what to move to.

On native, the compiler treats the main entry, `/engine` and `/svg` as the engine. The package's multiplatform tier moves from `web-only` to `shared`.
