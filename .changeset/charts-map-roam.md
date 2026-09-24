---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Maps roam on web and native. `<MapChart roam>` (and an ECharts `map` series or `geo` component with `roam`) pans on drag and zooms on the wheel or pinch, about the pointer, within `scaleLimit`. `roam: 'scale'` only zooms and `roam: 'move'` only pans. The view is part of the engine's `GeoOptions` (`zoom`, `panX`, `panY`), so regions, overlays and hit tests follow it. On native the gestures run the same `geoRoamPan` / `geoRoamZoom`. Scatter and lines on a `geo` coordinate now render through the map canvas host, so they roam too. `center`, `aspectScale`, `layoutCenter` and `layoutSize` now warn by name instead of being silently ignored.
