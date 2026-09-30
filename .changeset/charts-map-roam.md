---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Maps roam on web and native. `<MapChart roam>` pans on drag and zooms on the wheel or pinch, about the pointer, within `scaleLimit`. `roam: 'scale'` only zooms and `roam: 'move'` only pans. The view is part of the engine's `GeoOptions` (`zoom`, `panX`, `panY`), so regions, overlays and hit tests follow it. On native the gestures run the same `geoRoamPan` / `geoRoamZoom`.
