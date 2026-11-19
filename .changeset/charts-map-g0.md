---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Maps in `@pyreon/charts`, first slice: correctness and a usable interaction model.

- **Holes.** GeoJSON inner rings (lakes, enclaves) are kept end to end and cut out of the fill and the hit test: South Africa has Lesotho cut out and a point in a lake is not in the country. The fill is one "keyhole" ring per outer ring (the holes are joined in along zero-width bridges), so every draw executor, the tween and the mirror, and both native runtimes draw it unchanged; borders stroke the outline and each hole, never the bridge. A shape without holes draws exactly as before.
- **Speed.** Region values are read into region order once per change (a roam frame reads one array slot per region), and the projected features of a GeoJSON or registry map are memoised, so a pan or zoom frame re-projects no vertex (asserted with counters).
- **Interaction.** Hover outlines the region (`emphasis`), `selectedMode` `'single'` / `'multiple'` keeps a selection (`onSelectionChange`) from a click or Enter / Space, and the canvas description and the accessible table name the selected regions. It is a wrapper over the shared canvas host (`withItemStates`), so no other family's bundle changes; pie, treemap and sankey can adopt it. Web-only: iOS and Android warn by name.
- **Join and properties.** `options.idProperty` joins `values` on the feature `id` or any property; `onSelect` and the new `tooltipFormatter` receive the region's key, label, value and the feature's GeoJSON properties.
- **`geoToSvg`** draws the same layers as the live host (points, paths, heat, pies) and accepts the value list as well as a record.

Breaking (0.x, minor): the older duplicate overlay module is removed. `geoPointsToSvg`, `renderGeoPoints`, `renderGeoPaths`, `hitGeoPoint`, `geoPointRadii` and the types `GeoPoint`, `GeoPath`, `GeoPointsOptions`, `GeoPointsToSvgOptions` are gone; use `geoToSvg` (now with `points`, `paths`, `heat`, `pies`) and `renderGeoOverlayPoints`, `renderGeoOverlayPaths`, `hitGeoOverlayPoint`, `geoOverlayPointRadii`. Nothing in this repository used them.
