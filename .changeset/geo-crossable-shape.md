---
'@pyreon/charts': minor
---

The geo layout is a crossable shape: normalised rings, and a transform instead of a closure

`<MapChart>` is the last chart family with no native lowering, and the reason
was never charts — it was two shapes PMTC cannot carry. Both measured against
real `swiftc` and `kotlinc` rather than inferred from types:

- **GeoJSON's `geometry` is a `Polygon | MultiPolygon` union** whose
  `coordinates` are `number[][][]` and `number[][][][]` — one field at two
  array depths. The fat-struct lowering correctly bails by name rather than
  merging to `Any`.
- **`GeoLayout.project` was a closure field.** A generated struct is `Codable`,
  and a function field is not.

Both are gone. `geoShapes(geo)` reduces GeoJSON to `GeoShape { name, rings }`
in projection space — the only place the union or the untyped `properties` bag
is touched — and `layoutGeoShapes(shapes, box, options)` does the fit. The
closure becomes `GeoTransform` data plus a free `geoProject(t, lon, lat)`,
which is the same arithmetic the closure did.

`GeoShape[] -> GeoLayout` now compiles on both targets.

**Breaking**: `GeoLayout.project(lon, lat)` is replaced by
`geoProject(layout.transform, lon, lat)`. Pre-1.0, and a shim would defeat the
point — the whole change is that the layout is DATA. `layoutGeo(geo, box)`
still takes GeoJSON and composes the two halves, so callers that only lay out
and render are unaffected.

This is the first of three steps toward `<MapChart>` on iOS and Android; the
remaining two are splitting the GeoJSON half out of the crossing module, and
the native host — which still needs a decision about how map data reaches the
device, since `map="world"` resolves through a runtime registry that a
compile-time bake cannot see.
