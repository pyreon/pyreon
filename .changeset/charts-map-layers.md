---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Map layers for `@pyreon/charts`. `options.sphere` draws the outline of the whole sphere behind the regions and fits the box to it; `options.graticule` draws meridians and parallels. `flows` draw great-circle arcs (`flowOptions.progress` reveals each by arc length on the sphere; an arc crossing the seam is drawn as two runs, never a chord); `sizeLegend` adds a key of nested circles for sized point marks; Point, MultiPoint, LineString and MultiLineString features in a map's GeoJSON or TopoJSON become point marks and paths; `fitTo` zooms to named regions and `zoomOnClick` to a clicked one. Rings that cross the seam half a turn from the central meridian (Russia, Fiji, the Aleutians) are cut at it for Equal Earth, Natural Earth and Albers, for any central meridian, so no shape draws a chord across the map. `sphere`, `graticule` and the geometry lower to iOS and Android; `flows`, `sizeLegend`, `fitTo` and `zoomOnClick` are web-only (named warnings). A gallery for choropleth, bubble and flow maps uses `@pyreon/charts-maps`.
