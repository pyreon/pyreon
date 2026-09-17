---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Every series on a `geo` now draws. Previously only the first series rendered and the rest were silently dropped. `scatter`, `effectScatter` and `lines` combine. A `heatmap` on the geo draws soft radial blobs coloured by the visual map, a `pie` with `center: [lon, lat]` draws at that point, and a `map` series with `geoIndex` colours the geo's regions. `<MapChart>` gains `heat`, `heatRadius`, `heatStops` and `pies` on web and native. Anything else on a geo (a series off it, a pie without a centre, an unsupported type, a trail on geo lines) warns by name. `withAlpha` now applies alpha to `rgb(...)` colours; it used to return them fully opaque.
