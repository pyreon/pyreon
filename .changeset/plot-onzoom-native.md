---
'@pyreon/native-compiler': minor
---

`<PlotChart onZoom>` lowers on both native targets: one observer over the window state (SwiftUI `onChange` over the window's fields, Compose `LaunchedEffect(pyreonZoom)`) runs the handler with the `ZoomWindow` whenever a pinch, a pan, a preset tap or the navigator moves it — the web's single observer, mirrored. Without `dataZoom`, `zoomPresets` or `navigator` the prop warns by name, since there is no window to report.
