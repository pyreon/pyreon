---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Map projections for `@pyreon/charts`: `equalEarth` (Šavrič, Patterson and Jenny 2018), `naturalEarth1`, `albers` (equal-area conic with `parallel1`, `parallel2`, `centerLon`, `centerLat`) and `albersUsa` (the lower 48 with Alaska and Hawaii in insets; overlays project into the right inset), alongside `equirectangular` and `mercator`. Each has a forward and an inverse (`geoProject` / `geoUnproject`: a pointer back to lon/lat), with property tests (equal-area Jacobian, round trip, monotone along a parallel, published reference values). A central meridian rotates a world projection; a shape crossing the new seam is not clipped (stated in the docs). The arithmetic is engine code shared with iOS and Android, and `options={{ projection: 'equalEarth' }}` lowers (the compiler writes the enum case).

Also: a map's default colour ramp is the map's own, with each stop at least 3:1 against the dark page (the theme ramp's lowest stop WAS the dark page, so the lowest regions vanished), the lightest light stop at least 1.4:1 against white, and contrast rising with the value; a region with no value is hatched over the neutral fill (`options.hatchColor`) and a `visualMap` strip gets a "No data" swatch (web). Albers USA wraps longitude relative to each inset's own central meridian, so the Aleutians west of the antimeridian land in the Alaska inset instead of being thrown across the map; the composite's bounds drive the fit.
