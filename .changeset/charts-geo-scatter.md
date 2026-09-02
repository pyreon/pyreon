---
'@pyreon/charts': minor
---

Points and paths on a map: `renderGeoPoints` + `renderGeoPaths` / `hitGeoPoint` / `geoPointRadii` / `geoPointsToSvg` draw scatter and effectScatter symbols through a map layout's projection (value-scaled radii, halo rings, opt-in labels), and the option facade routes `scatter` / `effectScatter` / `lines` with `coordinateSystem: 'geo'` over the top-level `geo: { map, itemStyle }` (`[lon, lat, value]` data, `symbolSize`, per-point colours; other series types on geo warn by name). Conformance corpus 35 → 36, floor 33 → 34.
