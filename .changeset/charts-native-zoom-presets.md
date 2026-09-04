---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart zoomPresets>` lowers natively. The preset strip is now an engine module (`presets.ts`: `renderPresets` / `presetHit` / `presetWindow` / `presetIsActive`) that the web host consumes — the strip it paints is byte-identical — and that generates into `PyreonChartEngine.swift/.kt`, so iOS and Android lay out and hit-test the same buttons. On native a tap on a preset writes the host's window (re-anchoring an active pinch when `dataZoom` is on too); presets bring the window state with them even without `dataZoom`. A non-literal `zoomPresets` value warns by name and renders the chart without the strip.
