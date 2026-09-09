---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`<MapChart>` lowers to iOS and Android from a precomputed `GeoShape[]`

`<MapChart>` was the last `@pyreon/charts/plot` host with no native lowering,
and the recorded reason was a data shape rather than the geometry: GeoJSON's
`geometry` is a `Polygon | MultiPolygon` union whose `coordinates` are
`number[][][]` and `number[][][][]` — one field at two array depths, which the
native struct lowering correctly refuses to merge.

`map` now takes a third shape, `GeoShape[]`, which is that union already
normalised to rings — and that shape crosses. A `<MapChart map={SHAPES}
values={{ A: 5 }}>` emits `layoutGeoShapes` / `renderGeo` / `hitGeoIndex` /
`geoTip` over the generated engine on both targets, with the tap, the tooltip
and the theme defaults every other family host already had. An inline `values`
record becomes the crossing `[GeoValue]` at compile time (the shape
`<CalendarChart values>` already used); a `GeoValue[]` passes through.

The two web-only `map` shapes — a `registerMap` name and a raw
FeatureCollection — now refuse BY NAME and say which shape does cross, instead
of the host declining wholesale. `geoShapes(json)` itself reads GeoJSON, so
shared multiplatform source passes a precomputed const and projects on the web
or in a build step.

Also fixed, and visible on the web too: a geo border defaults from the page
GROUND, and `background: ''` ("inherit the page") is the one theme field a
chart cannot paint with. The native emit resolved it to an empty colour;
`ChartThemeText` now carries a derived `pageGround` that resolves it to white,
so a native map's borders read `#ffffff` on light and `#141821` on dark —
the same values the web host computes.
