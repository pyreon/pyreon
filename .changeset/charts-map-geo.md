---
'@pyreon/charts': minor
---

Map family: `registerMap` / `getMap` / `listMaps` (ECharts' registry shape over GeoJSON FeatureCollections), `projectLonLat` (equirectangular or Mercator with polar clamping), `layoutGeo` (Polygon + MultiPolygon outer rings projected and fitted into a box with aspect preserved, north up, area-weighted centroids, per-region bboxes, a reusable `project` for overlays), `geoDomain`, `renderGeo` (fills through the shared heat ramp with a data or `visualMap` domain, an empty colour for regions without data, borders, labels only where they fit, fade-in entrance), `hitGeo` (bbox then point-in-ring), `<MapChart>` (reactive canvas host over a GeoJSON or a registered name, `onSelect(region)`, accessible table), `geoToSvg` (server-safe).
