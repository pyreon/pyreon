---
'@pyreon/charts': minor
---

TopoJSON for `@pyreon/charts` maps. `topoToGeo(topology, object?)` decodes a TopoJSON topology (arcs, the quantisation transform and its delta encoding, stitching, shared borders walked reversed, holes) to the GeoJSON the map code already reads, with no dependency. `registerMap(name, source, { projection, nameProperty, idProperty, object })` takes GeoJSON, TopoJSON or a `MapDefinition` and decodes once at registration; `<MapChart map>` and `geoToSvg({ geo })` take any of them. A `MapDefinition` (`{ data, object, projection, nameProperty, idProperty }`) carries the choices a map was prepared for; an explicit `options` value still wins over the map's own default, and overlay points project through the map's effective projection.
