---
'@pyreon/charts': patch
---

`<OptionChart>` compiles its option once per change instead of six times per mount. The paint, the hit-test layout and the accessible input each planned the same option, twice per mount. The accessible path also laid the chart out at a fallback 300px width before the canvas existed, even when the chart had its own `width`. A 100,000-point option now mounts ~1.6× faster (55ms → 35ms in real Chromium), ahead of ECharts' 49ms on the same run.
