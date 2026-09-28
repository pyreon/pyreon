---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/native-cli': patch
'@pyreon/lint': patch
'@pyreon/primitives': patch
'@pyreon/flow': patch
'@pyreon/zero': patch
'@pyreon/create-zero': patch
'@pyreon/cli': patch
'@pyreon/mcp': patch
---

`@pyreon/charts` no longer carries an ECharts-compatibility layer. It is Pyreon's own engine only: `<Chart>` with mark children, the family components, `/svg` and `/engine`.

- The chart engine drops every `Series` / `ChartSpec` field and helper that only an ECharts option could set: the ECharts bar layout and nice-domain algorithm, label placement and rich text, emphasis/select/blur states, extra and secondary x axes, axis-line / tick / minor-tick / split-area options, grid insets, inverse axes, pictorial symbol layout and the `lines` series. None of them was reachable from `<Chart>`; the generated native engines shrink by the same amount.
- `<FunnelChart echarts>` is removed; `funnel` covers sorting and alignment.
- `<GaugeChart dial>` takes a spec built with the new `gaugeDial({ data, … })`, every part defaulted. On iOS and Android `dial` now warns and draws the half-circle track.
- `visualMap` on `<HeatmapChart>`, `<CalendarChart>` and `<MapChart>` takes a spec built with the new `visualMap({ domain, … })`, which also lowers to native.
- `<CandlestickChart zoom>` takes a `CandlestickZoom` whose fields are all optional (`inside`, `slider`, `window`, `lock`, `minSpan`, `maxSpan`).
- `ChartHandle` loses the timeline (`step`, `playing`, `timelineChange`, `timelinePlayChange`), which only an option chart had; the native `PyreonChartHandle` follows.
- `tweenCmds` passes `clip` / `unclip` through instead of dropping them.

The native compiler drops the `<OptionChart>` and `<ChartWebView>` lowering. `pyreon/no-web-only-import-in-portable` no longer flags `@pyreon/charts`, which draws natively.
